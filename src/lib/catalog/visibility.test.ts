import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { COURSE_HAS_PRICE, COURSE_PROVISIONABLE } from "./visibility"

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
    expect(src).toMatch(/AND: \[COURSE_PROVISIONABLE\]/)
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
