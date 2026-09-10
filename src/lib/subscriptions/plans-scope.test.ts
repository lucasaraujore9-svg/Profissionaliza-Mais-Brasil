import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Quem enxerga qual plano.
 *
 * Contrato: plano da PMB (`tenantId` null) vai para TODAS as vitrines; plano
 * criado por uma unidade aparece SO na dela. Um plano de outra revenda nunca
 * pode ser listado nem vendido aqui — seria vender curso que nao e dela.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscriptionPlan: { findMany: vi.fn(), findUnique: vi.fn() },
    tenantSubscriptionPlan: { findMany: vi.fn(), findUnique: vi.fn() },
    coursePackageItem: { findMany: vi.fn(async () => []) },
    course: { count: vi.fn(async () => 5) },
    // Modulo "Vender assinaturas" da unidade. Ligado por padrao aqui: os casos
    // de escopo abaixo sao sobre QUAL plano, nao sobre SE a loja vende.
    tenant: { findUnique: vi.fn() },
  },
}))
vi.mock("@/lib/catalog/visibility", () => ({ COURSE_HAS_PRICE: {}, COURSE_PROVISIONABLE: {} }))
vi.mock("@/lib/tenant/courses", () => ({ visibilityFilter: () => ({}) }))

import { prisma } from "@/lib/prisma"
import { resolveVitrinePlans, getPlanForCheckout } from "./plans"

const findPlans = prisma.subscriptionPlan.findMany as unknown as ReturnType<typeof vi.fn>
const findOne = prisma.subscriptionPlan.findUnique as unknown as ReturnType<typeof vi.fn>
const findOverrides = prisma.tenantSubscriptionPlan.findMany as unknown as ReturnType<typeof vi.fn>
const findOverride = prisma.tenantSubscriptionPlan.findUnique as unknown as ReturnType<typeof vi.fn>
const findTenant = prisma.tenant.findUnique as unknown as ReturnType<typeof vi.fn>

function plan(over: Record<string, unknown> = {}) {
  return {
    id: "p1",
    tenantId: null,
    name: "Plano",
    slug: "plano",
    description: null,
    coverImageUrl: null,
    price: 49.9,
    enabled: true,
    featured: false,
    position: 0,
    scope: "ALL",
    categoryIds: [],
    courseIds: [],
    packageId: null,
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  findOverrides.mockResolvedValue([])
  findOverride.mockResolvedValue(null)
  findTenant.mockResolvedValue({ subscriptionsEnabled: true })
})

describe("resolveVitrinePlans", () => {
  it("a vitrine da unidade busca os da PMB E os proprios", async () => {
    findPlans.mockResolvedValue([])
    await resolveVitrinePlans("t1")
    const where = findPlans.mock.calls[0][0].where
    expect(where.OR).toEqual([{ tenantId: null }, { tenantId: "t1" }])
  })

  it("a vitrine PMB busca SO os da PMB", async () => {
    // Sem isto, um plano criado por uma revenda apareceria na loja da mãe.
    findPlans.mockResolvedValue([])
    await resolveVitrinePlans(null)
    expect(findPlans.mock.calls[0][0].where).toEqual({
      tenantId: null,
      enabled: true,
    })
  })

  it("plano proprio da unidade aparece primeiro", async () => {
    findPlans.mockResolvedValue([
      plan({ id: "pmb", name: "Da PMB" }),
      plan({ id: "meu", tenantId: "t1", name: "Meu plano" }),
    ])
    const out = await resolveVitrinePlans("t1")
    expect(out.map((p) => p.id)).toEqual(["meu", "pmb"])
  })

  it("plano oculto pela unidade some da vitrine dela", async () => {
    findPlans.mockResolvedValue([plan()])
    findOverrides.mockResolvedValue([{ planId: "p1", isVisible: false }])
    expect(await resolveVitrinePlans("t1")).toHaveLength(0)
  })

  it("plano sem curso vendavel nao e listado", async () => {
    // Vender acesso a um catálogo vazio é pior do que não ter o produto.
    const count = prisma.course.count as unknown as ReturnType<typeof vi.fn>
    count.mockResolvedValueOnce(0)
    findPlans.mockResolvedValue([plan()])
    expect(await resolveVitrinePlans("t1")).toHaveLength(0)
  })
})

describe("getPlanForCheckout", () => {
  it("unidade vende o proprio plano", async () => {
    findOne.mockResolvedValue(plan({ id: "meu", tenantId: "t1" }))
    const out = await getPlanForCheckout("t1", "meu")
    expect(out?.id).toBe("meu")
  })

  it("unidade NAO vende plano de OUTRA revenda", async () => {
    // Liberaria cursos que não são dela, cobrando na conta dela.
    findOne.mockResolvedValue(plan({ id: "alheio", tenantId: "t2" }))
    expect(await getPlanForCheckout("t1", "alheio")).toBeNull()
  })

  it("vitrine PMB NAO vende plano de revenda", async () => {
    findOne.mockResolvedValue(plan({ id: "dela", tenantId: "t1" }))
    expect(await getPlanForCheckout(null, "dela")).toBeNull()
  })

  it("plano desativado nao e vendavel", async () => {
    findOne.mockResolvedValue(plan({ enabled: false }))
    expect(await getPlanForCheckout(null, "p1")).toBeNull()
  })

  it("preco vem do override da unidade, nao do corpo do pedido", async () => {
    findOne.mockResolvedValue(plan())
    findOverride.mockResolvedValue({ price: 79.9, isVisible: true })
    const out = await getPlanForCheckout("t1", "p1")
    expect(out?.price).toBe(79.9)
  })
})

/**
 * O modulo "Vender assinaturas" e por UNIDADE e nasce desligado. O gate mora
 * nestas duas funcoes porque todas as portas passam por elas: a vitrine, o link
 * da navbar, a pagina do plano, /aluno/assinar e a venda direta do painel (para
 * listar) e os tres checkouts (para cobrar).
 */
describe("modulo da unidade", () => {
  it("unidade sem o modulo nao lista plano nenhum — nem o dela, nem o da PMB", async () => {
    findTenant.mockResolvedValue({ subscriptionsEnabled: false })
    findPlans.mockResolvedValue([
      plan({ id: "pmb" }),
      plan({ id: "meu", tenantId: "t1" }),
    ])
    expect(await resolveVitrinePlans("t1")).toEqual([])
    // Sai ANTES de montar a vitrine: nada de contagem de curso por plano numa
    // loja que nem vende o produto.
    expect(findPlans).not.toHaveBeenCalled()
  })

  it("unidade sem o modulo nao cobra, mesmo com um planId valido no corpo", async () => {
    // A tela aberta antes de o modulo ser desligado, ou um POST direto.
    findTenant.mockResolvedValue({ subscriptionsEnabled: false })
    findOne.mockResolvedValue(plan({ id: "meu", tenantId: "t1" }))
    expect(await getPlanForCheckout("t1", "meu")).toBeNull()
    expect(findOne).not.toHaveBeenCalled()
  })

  it("unidade inexistente e fail-closed", async () => {
    findTenant.mockResolvedValue(null)
    findPlans.mockResolvedValue([plan()])
    expect(await resolveVitrinePlans("t1")).toEqual([])
  })

  it("a vitrine da PMB vende sem depender do modulo", async () => {
    findPlans.mockResolvedValue([plan()])
    findOne.mockResolvedValue(plan())
    expect(await resolveVitrinePlans(null)).toHaveLength(1)
    expect(await getPlanForCheckout(null, "p1")).not.toBeNull()
    expect(findTenant).not.toHaveBeenCalled()
  })
})
