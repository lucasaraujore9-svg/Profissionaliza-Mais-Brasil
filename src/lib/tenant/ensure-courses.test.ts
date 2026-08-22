import { describe, expect, it } from "vitest"
import { catalogScopeForTenant, initialTenantCoursePrice } from "./ensure-courses"

const TENANT = "tenant_a"

function scopeBranches(hasWallet: boolean) {
  const where = catalogScopeForTenant(TENANT, hasWallet)
  return (where.OR ?? []) as Record<string, unknown>[]
}

describe("alcance do catalogo por unidade", () => {
  it("sempre inclui o catalogo da PMB", () => {
    for (const hasWallet of [true, false]) {
      expect(scopeBranches(hasWallet)).toContainEqual({ authorTenantId: null })
    }
  })

  it("sempre inclui os cursos da propria unidade, ate em rascunho", () => {
    const branch = scopeBranches(false).find((b) => b.authorTenantId === TENANT)
    expect(branch).toEqual({ authorTenantId: TENANT })
    // Sem filtro de authoredStatus de proposito: a unidade precisa ver o
    // proprio rascunho no painel dela.
    expect(branch).not.toHaveProperty("authoredStatus")
  })

  it("so alcanca curso de OUTRA unidade quando ha carteira Asaas", () => {
    const semCarteira = scopeBranches(false)
    expect(semCarteira.some((b) => b.distribution === "NETWORK")).toBe(false)

    const comCarteira = scopeBranches(true)
    expect(comCarteira).toContainEqual({
      authorTenantId: { not: null },
      distribution: "NETWORK",
      authoredStatus: "PUBLISHED",
    })
  })

  it("curso de terceiro so entra PUBLICADO e com alcance de rede", () => {
    const branch = scopeBranches(true).find((b) => b.distribution === "NETWORK")
    expect(branch?.authoredStatus).toBe("PUBLISHED")
    expect(branch?.distribution).toBe("NETWORK")
  })

  it("filtra por curso ativo", () => {
    expect(catalogScopeForTenant(TENANT, true).status).toBe("ATIVO")
  })
})

describe("preco inicial na vitrine", () => {
  const pmbCourse = {
    id: "c1",
    precoVitrineMain: 150,
    precoPromocional: 120,
    precoOriginal: 200,
    destaque: false,
    authorTenantId: null,
    pricingMode: "FIXED" as const,
    authorAmount: null,
    sellerCommissionPercent: null,
    platformFeePercent: null,
  }

  it("curso da PMB herda a cascata de precos de hoje", () => {
    expect(initialTenantCoursePrice(pmbCourse)).toBe(150)
    expect(initialTenantCoursePrice({ ...pmbCourse, precoVitrineMain: null })).toBe(120)
    expect(
      initialTenantCoursePrice({
        ...pmbCourse,
        precoVitrineMain: null,
        precoPromocional: null,
      }),
    ).toBe(200)
  })

  it("curso de autoria FIXED nasce no preco do produtor, nao no do catalogo", () => {
    const price = initialTenantCoursePrice({
      ...pmbCourse,
      authorTenantId: "tenant_produtor",
      pricingMode: "FIXED",
      authorAmount: 297,
      sellerCommissionPercent: 20,
      platformFeePercent: 5,
    })
    expect(price).toBe(297)
  })

  it("curso MIN_PRODUCER_NET nasce no PISO VENDAVEL, nunca abaixo dele", () => {
    // 200 / (1 - 0,20 - 0,05) = 266,67 — nascer em 200 deixaria a linha
    // invendavel: a unidade veria o curso e tomaria erro ao publicar.
    const price = initialTenantCoursePrice({
      ...pmbCourse,
      authorTenantId: "tenant_produtor",
      pricingMode: "MIN_PRODUCER_NET",
      authorAmount: 200,
      sellerCommissionPercent: 20,
      platformFeePercent: 5,
    })
    expect(price).toBe(266.67)
  })

  it("curso de autoria sem termos nasce sem preco (nao vende)", () => {
    expect(
      initialTenantCoursePrice({
        ...pmbCourse,
        authorTenantId: "tenant_produtor",
        authorAmount: null,
      }),
    ).toBe(0)
  })
})
