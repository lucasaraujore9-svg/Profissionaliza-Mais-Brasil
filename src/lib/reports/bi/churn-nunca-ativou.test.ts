import { describe, it, expect, vi, beforeEach } from "vitest"

/*
 * O churn contava como cliente perdido quem nunca foi cliente.
 *
 * Medido em produção (07/08/2026): 9,5% (11/116) viravam 4,4% (4/91), e 20
 * unidades — 13 suspensas + 7 canceladas — passavam para "Nunca ativou". A
 * diferença toda vem de unidades que nasceram de graça, ganharam prazo esticado
 * (`valedosaber` D+20, `andersoncidade` D+15) e foram suspensas antes do 1º
 * boleto.
 */

const db = vi.hoisted(() => ({
  tenant: { count: vi.fn(), findMany: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn() },
  tenantPayment: { aggregate: vi.fn(), findMany: vi.fn() },
  user: { findMany: vi.fn() },
  $queryRawUnsafe: vi.fn(),
}))
vi.mock("@/lib/prisma", () => ({ prisma: db }))
vi.mock("../aggregations", () => ({ approvedRevenueTotal: vi.fn(async () => 0) }))

import { financeiroModule } from "./financeiro"
import { redeRevendedoresModule } from "./rede-revendedores"
import { EVER_PAID_PAYMENT_WHERE } from "@/lib/tenants/lifecycle"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"

const period = {
  start: new Date("2026-07-01T00:00:00Z"),
  end: new Date("2026-08-01T00:00:00Z"),
  bucket: "day",
} as never

function biCtx(unidadesWhere: unknown = {}) {
  return {
    period,
    session: { unidadesWhere: async () => unidadesWhere },
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  db.tenant.findMany.mockResolvedValue([])
  db.tenant.aggregate.mockResolvedValue({ _sum: { planValue: 0 } })
  db.tenant.groupBy.mockResolvedValue([])
  db.tenantPayment.aggregate.mockResolvedValue({ _sum: { amount: 0 } })
  db.tenantPayment.findMany.mockResolvedValue([])
  db.user.findMany.mockResolvedValue([])
  db.$queryRawUnsafe.mockResolvedValue([])
})

/** Lê o KPI pelo `key` do payload devolvido pelo módulo. */
function kpi(payload: { kpis?: { key: string; value: number; label: string }[] }, key: string) {
  return payload.kpis?.find((k) => k.key === key)
}

describe("aba Financeiro — churn", () => {
  it("divide canceladas-que-pagaram pela base de pagantes", async () => {
    // Ordem das contagens: canceladas∩pagantes, pagantes, nunca-ativou.
    db.tenant.count
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(91)
      .mockResolvedValueOnce(20)

    const payload = await financeiroModule.run(biCtx())

    expect(kpi(payload, "churn")?.value).toBeCloseTo((4 / 91) * 100, 5)
    expect(kpi(payload, "nuncaAtivou")?.value).toBe(20)
  })

  it("o rótulo avisa que a base mudou", async () => {
    db.tenant.count.mockResolvedValue(0)
    const payload = await financeiroModule.run(biCtx())
    expect(kpi(payload, "churn")?.label).toBe("Churn (pagantes)")
  })

  it("não divide por zero quando ninguém pagou ainda", async () => {
    db.tenant.count.mockResolvedValue(0)
    const payload = await financeiroModule.run(biCtx())
    expect(kpi(payload, "churn")?.value).toBe(0)
  })

  /**
   * `planValue > 0` era o proxy de "pagante" — e é o valor de HOJE. Unidade que
   * pagou e depois virou cortesia sumia do churn; unidade que nunca pagou
   * entrava nele.
   */
  it("a base do churn olha pagamento, não planValue", async () => {
    db.tenant.count.mockResolvedValue(0)
    await financeiroModule.run(biCtx())

    const [numerador, denominador] = db.tenant.count.mock.calls
    expect(numerador[0].where.tenantPayments).toEqual({ some: EVER_PAID_PAYMENT_WHERE })
    expect(numerador[0].where.status).toBe("CANCELLED")
    expect(denominador[0].where.tenantPayments).toEqual({ some: EVER_PAID_PAYMENT_WHERE })
    expect(denominador[0].where).not.toHaveProperty("status")
    // A PMB não é cliente de si mesma.
    expect(denominador[0].where.slug).toEqual({ not: PMB_TENANT_SLUG })
  })

  it("MRR e receitas seguem em planValue > 0 — só o churn mudou", async () => {
    db.tenant.count.mockResolvedValue(0)
    await financeiroModule.run(biCtx())

    expect(db.tenant.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "ACTIVE", planValue: { gt: 0 } },
      }),
    )
  })
})

describe("aba Revendedores — Nunca ativou", () => {
  beforeEach(() => {
    db.tenant.groupBy.mockResolvedValue([
      { status: "ACTIVE", _count: { _all: 80 } },
      { status: "PENDING", _count: { _all: 1 } },
      { status: "SUSPENDED", _count: { _all: 26 } },
      { status: "CANCELLED", _count: { _all: 11 } },
    ])
    // `novas`, depois nuncaAtivou suspensas e canceladas.
    db.tenant.count
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(13)
      .mockResolvedValueOnce(7)
  })

  it("desconta de Suspensas quem nunca pagou", async () => {
    const payload = await redeRevendedoresModule.run(biCtx())

    expect(kpi(payload, "suspended")?.value).toBe(26 - 13)
    expect(kpi(payload, "nuncaAtivou")?.value).toBe(13 + 7)
  })

  it("o funil ganha a etapa e não conta ninguém duas vezes", async () => {
    const payload = await redeRevendedoresModule.run(biCtx())

    const funnel = payload.series?.find((s) => s.id === "funnel")
    const pontos = (funnel?.points ?? []) as { x: string; value: number }[]
    const ponto = (x: string) => pontos.find((p) => p.x === x)?.value

    expect(ponto("Suspensas")).toBe(13)
    expect(ponto("Canceladas")).toBe(4)
    expect(ponto("Nunca ativou")).toBe(20)
    // 1 + 80 + 13 + 4 + 20 = 118 = total das quatro contagens de status: a
    // etapa nova REPARTE as populações, não duplica ninguém.
    const soma = pontos.reduce((acc, p) => acc + p.value, 0)
    expect(soma).toBe(80 + 1 + 26 + 11)
  })

  it("as duas tabelas separam as populações", async () => {
    const payload = await redeRevendedoresModule.run(biCtx())

    const tables = payload.tables ?? []
    expect(tables.map((t) => t.id)).toEqual(
      expect.arrayContaining(["inadimplentes", "nunca-ativou"]),
    )
    expect(tables.find((t) => t.id === "inadimplentes")?.subtitle).toContain(
      "Já pagaram",
    )
  })

  it("respeita o recorte de carteira de quem consulta", async () => {
    await redeRevendedoresModule.run(biCtx({ accountManagerId: "u9" }))

    for (const call of db.tenant.findMany.mock.calls) {
      expect(call[0].where.accountManagerId).toBe("u9")
    }
  })

  it("devolve vazio para quem não alcança unidade nenhuma", async () => {
    const payload = await redeRevendedoresModule.run(biCtx(null))
    expect(payload.kpis ?? []).toHaveLength(0)
  })
})
