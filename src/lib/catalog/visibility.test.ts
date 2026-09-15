import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import type { Prisma } from "@prisma/client"
import {
  COURSE_HAS_PRICE,
  COURSE_PROVISIONABLE,
  courseCuratedForTenant,
  isCourseCuratedForTenant,
} from "./visibility"

/**
 * "Curso que a plataforma de aulas não consegue matricular não pode ser vendido."
 *
 * A regra nasceu de um incidente real: a fornecedora renomeou o curso 267, o sync
 * criou uma linha nova sem `plataformaCourseId` e ela foi parar na vitrine de 18
 * unidades. Quem tentava vender/liberar recebia "Falha ao matricular o aluno na
 * plataforma de aulas" — no checkout público, DEPOIS de o aluno pagar.
 *
 * O sync já não produz mais essa linha, mas um gate que existe só na origem
 * protege só até a próxima origem. Estes testes prendem o gate nas consultas que
 * decidem o que aparece e o que se propaga — remover um deles quebra aqui, não em
 * produção.
 */
const SRC = (rel: string) =>
  fs.readFileSync(path.join(process.cwd(), "src", rel), "utf8")

describe("COURSE_PROVISIONABLE", () => {
  it("exige o id da fornecedora correspondente ao provider do curso", () => {
    expect(COURSE_PROVISIONABLE).toEqual({
      OR: [
        { provider: "EA", plataformaCourseId: { not: null } },
        { provider: "LMS", lmsCourseId: { not: null } },
      ],
    })
  })

  it("usa OR na raiz — por isso só pode ser composto em AND", () => {
    // Espelha o cuidado documentado em COURSE_HAS_PRICE: dois OR no mesmo objeto
    // se sobrescreveriam e o curso passaria por UMA das regras em vez das duas.
    expect(Object.keys(COURSE_PROVISIONABLE)).toEqual(["OR"])
    expect(Object.keys(COURSE_HAS_PRICE)).toEqual(["OR"])
  })
})

describe("o gate está preso nas consultas que decidem venda", () => {
  it("vitrine de revenda: `visibilityFilter` carrega o gate", () => {
    const src = SRC("lib/tenant/courses.ts")
    expect(src).toMatch(/AND: \[COURSE_PROVISIONABLE, courseCuratedForTenant\(tenantId\)\]/)
  })

  it("propagação para as revendas: `catalogScopeForTenant` carrega o gate", () => {
    const src = SRC("lib/tenant/ensure-courses.ts")
    expect(src).toMatch(/AND: \[COURSE_PROVISIONABLE\]/)
    // E o caminho inverso (um curso -> muitos tenants), que é o que espalhou o
    // curso 267 por 18 vitrines: lá a linha já vem carregada, então a regra é
    // repetida como guarda.
    expect(src).toMatch(/if \(!providerId\) return 0/)
  })

  it("vitrine mãe: todo AND com COURSE_HAS_PRICE também traz COURSE_PROVISIONABLE", () => {
    const arquivos = [
      "app/sitemap.ts",
      "app/api/home/showcase/route.ts",
      "app/api/aluno/catalogo/route.ts",
      "lib/home/sections.ts",
      "lib/catalog/home.ts",
    ]
    for (const f of arquivos) {
      const src = SRC(f)
      expect(
        src.includes("AND: [COURSE_HAS_PRICE]"),
        `${f}: COURSE_HAS_PRICE sem COURSE_PROVISIONABLE ao lado`,
      ).toBe(false)
    }
  })

  it("venda por ID direto: `authoredSaleGate` recusa antes de cobrar", () => {
    const src = SRC("lib/course-authoring/checkout-gate.ts")
    expect(src).toMatch(/COURSE_NOT_PROVISIONABLE/)
    // O select compartilhado é o que faz as oito portas herdarem o gate.
    expect(SRC("lib/course-authoring/split-server.ts")).toMatch(
      /plataformaCourseId: true/,
    )
  })

  it("pacote: um curso não matriculável derruba o pacote inteiro, não some da lista", () => {
    const src = SRC("lib/packages/vitrine.ts")
    expect(src).toMatch(/if \(semFornecedora\) return null/)
  })
})

/**
 * Curadoria da PMB por unidade (`Course.visibilityMode`). A regra existia só nas
 * listagens da vitrine pública: uma unidade fora de "ocultar para todas EXCETO"
 * via o curso como visível no painel e conseguia vendê-lo pela venda direta,
 * pelo checkout por ID e por dentro de pacote.
 */
describe("courseCuratedForTenant x isCourseCuratedForTenant", () => {
  type Curation = Prisma.CourseGetPayload<{
    select: { visibilityMode: true; allowedTenantIds: true; blockedTenantIds: true }
  }>

  // Interpretador mínimo do `where` gerado — só os operadores que ele usa. Se o
  // `where` ganhar um operador novo, o interpretador lança e o teste avisa.
  function matches(where: Prisma.CourseWhereInput, c: Curation): boolean {
    return Object.entries(where).every(([key, cond]) => {
      if (key === "OR") return (cond as Prisma.CourseWhereInput[]).some((w) => matches(w, c))
      if (key === "NOT") return !matches(cond as Prisma.CourseWhereInput, c)
      if (key === "visibilityMode") return c.visibilityMode === cond
      if (key === "allowedTenantIds") return c.allowedTenantIds.includes((cond as { has: string }).has)
      if (key === "blockedTenantIds") return c.blockedTenantIds.includes((cond as { has: string }).has)
      throw new Error(`operador não suportado no teste: ${key}`)
    })
  }

  const T = "tenant_a"
  const casos: [string, Curation][] = [
    ["ALL", { visibilityMode: "ALL", allowedTenantIds: [], blockedTenantIds: [] }],
    ["ALLOWLIST com a unidade", { visibilityMode: "ALLOWLIST", allowedTenantIds: [T], blockedTenantIds: [] }],
    ["ALLOWLIST sem a unidade", { visibilityMode: "ALLOWLIST", allowedTenantIds: ["outra"], blockedTenantIds: [] }],
    ["ALLOWLIST vazia", { visibilityMode: "ALLOWLIST", allowedTenantIds: [], blockedTenantIds: [] }],
    ["DENYLIST com a unidade", { visibilityMode: "DENYLIST", allowedTenantIds: [], blockedTenantIds: [T] }],
    ["DENYLIST sem a unidade", { visibilityMode: "DENYLIST", allowedTenantIds: [], blockedTenantIds: ["outra"] }],
    // A lista do modo que NÃO está ativo não pode decidir nada: o drawer do admin
    // zera a outra lista, mas o banco não garante isso.
    ["ALL com lixo nas listas", { visibilityMode: "ALL", allowedTenantIds: ["outra"], blockedTenantIds: [T] }],
    ["ALLOWLIST com a unidade também bloqueada", { visibilityMode: "ALLOWLIST", allowedTenantIds: [T], blockedTenantIds: [T] }],
  ]

  it.each(casos)("paridade: %s", (_nome, curso) => {
    expect(isCourseCuratedForTenant(curso, T)).toBe(matches(courseCuratedForTenant(T), curso))
  })

  it("resultados esperados (não só paridade — as duas metades podiam errar juntas)", () => {
    const esperado = casos.map(([nome, c]) => [nome, isCourseCuratedForTenant(c, T)])
    expect(esperado).toEqual([
      ["ALL", true],
      ["ALLOWLIST com a unidade", true],
      ["ALLOWLIST sem a unidade", false],
      ["ALLOWLIST vazia", false],
      ["DENYLIST com a unidade", false],
      ["DENYLIST sem a unidade", true],
      ["ALL com lixo nas listas", true],
      ["ALLOWLIST com a unidade também bloqueada", true],
    ])
  })

  it("modo desconhecido é fail-closed", () => {
    const estranho = { visibilityMode: "OUTRO", allowedTenantIds: [T], blockedTenantIds: [] } as unknown as Curation
    expect(isCourseCuratedForTenant(estranho, T)).toBe(false)
  })

  it("usa OR na raiz — por isso só pode ser composto em AND", () => {
    expect(Object.keys(courseCuratedForTenant(T))).toEqual(["OR"])
  })
})

describe("a curadoria está presa em todas as portas da unidade", () => {
  const portas: [string, RegExp][] = [
    // Venda: o gate único das portas de venda, via select compartilhado.
    ["lib/course-authoring/checkout-gate.ts", /COURSE_NOT_AVAILABLE_FOR_TENANT/],
    ["lib/course-authoring/split-server.ts", /\.\.\.COURSE_CURATION_SELECT/],
    // Painel: listagem de cursos, venda direta, pacotes e editor da home.
    ["app/api/painel/cursos/route.ts", /courseCuratedForTenant\(ctx\.tenantId\)/],
    ["app/painel/vendas/nova/page.tsx", /courseCuratedForTenant\(user\.tenantId\)/],
    ["app/api/painel/pacotes/route.ts", /COURSE_NOT_AVAILABLE_FOR_TENANT/],
    ["app/api/painel/pacotes/[id]/route.ts", /COURSE_NOT_AVAILABLE_FOR_TENANT/],
    ["app/api/painel/pacotes/courses-lookup/route.ts", /courseCuratedForTenant\(/],
    ["app/api/painel/home-sections/options/route.ts", /getHomeSectionsOptions\(guard\.ctx\.tenantId\)/],
    // Loja: checkout, API de cursos, sitemap e llms.txt.
    ["app/loja/checkout/page.tsx", /visibilityFilter\(tenant\.id\)/],
    ["app/api/loja/courses/route.ts", /visibilityFilter\(tenantId\)/],
    ["app/sitemap.ts", /visibilityFilter\(tenantId\)/],
    ["app/llms.txt/route.ts", /visibilityFilter\(tenant\.id\)/],
    // Pacote: vitrine/checkout E a liberação, que relê os itens no pagamento.
    ["lib/packages/vitrine.ts", /isCourseCuratedForTenant\(i\.course, tenantId\)/],
    ["lib/enrollment/fulfill.ts", /isCourseCuratedForTenant\(course, expectedTenantId\)/],
  ]
  it.each(portas)("%s", (arquivo, regra) => {
    expect(SRC(arquivo)).toMatch(regra)
  })

  it("nenhuma cópia da regra sobrou fora de lib/catalog/visibility.ts", () => {
    for (const f of ["lib/home/sections.ts", "lib/catalog/home.ts", "lib/tenant/courses.ts"]) {
      expect(SRC(f), f).not.toMatch(/allowedTenantIds: \{ has:/)
    }
  })
})
