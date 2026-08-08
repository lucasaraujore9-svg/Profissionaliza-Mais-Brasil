import { describe, it, expect, vi, beforeEach } from "vitest"

/*
 * A fórmula do churn vive em TRÊS lugares (a aba Financeiro do relatório e
 * estas duas APIs). O risco aqui não é a fórmula — é a ORDEM: os counts saem de
 * um `Promise.all` e são desestruturados por posição, então trocar duas linhas
 * inverte numerador e denominador sem erro de tipo e sem ninguém perceber.
 *
 * `bi/financeiro.ts` já tem cobertura própria; estas duas rotas não tinham
 * nenhuma. O teste fixa (a) que a base é "já pagou", não `planValue > 0`, e
 * (b) que o CANCELLED é o numerador.
 */

const db = vi.hoisted(() => ({
  tenant: { count: vi.fn(), findMany: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn() },
  tenantPayment: { aggregate: vi.fn(), findMany: vi.fn() },
  student: { count: vi.fn() },
  enrollment: { count: vi.fn() },
  payment: { count: vi.fn() },
  $queryRaw: vi.fn(),
  $queryRawUnsafe: vi.fn(),
}))
vi.mock("@/lib/prisma", () => ({ prisma: db }))

const requireAdmin = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth/admin-guard", () => ({ requireAdmin }))

import { GET as GET_FINANCEIRO } from "@/app/api/admin/financeiro/route"
import { GET as GET_ANALYTICS } from "@/app/api/admin/analytics/route"
import { EVER_PAID_PAYMENT_WHERE } from "@/lib/tenants/lifecycle"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"
import { adminGuardFor } from "@/test/admin-ctx"

beforeEach(() => {
  vi.clearAllMocks()
  requireAdmin.mockImplementation(
    adminGuardFor({ userId: "u1", role: "SUPER_ADMIN" }).requireAdmin,
  )
  db.tenant.findMany.mockResolvedValue([])
  db.tenant.aggregate.mockResolvedValue({ _sum: { planValue: 0 } })
  db.tenant.groupBy.mockResolvedValue([])
  db.tenantPayment.aggregate.mockResolvedValue({ _sum: { amount: 0 } })
  db.tenantPayment.findMany.mockResolvedValue([])
  db.student.count.mockResolvedValue(0)
  db.enrollment.count.mockResolvedValue(0)
  db.payment.count.mockResolvedValue(0)
  db.$queryRaw.mockResolvedValue([])
  db.$queryRawUnsafe.mockResolvedValue([])
})

/**
 * Responde CADA count pelo `where` que ele recebeu, não pela ordem da chamada.
 *
 * Mock por ordem (`mockResolvedValueOnce`) é CEGO à inversão que este arquivo
 * existe para pegar: trocar as duas linhas no `Promise.all` mantém a sequência
 * de valores e o teste continua verde. Amarrando o valor à consulta, inverter a
 * ordem passa a trocar 4 por 91 de verdade.
 */
function countByWhere({ base, cancelled }: { base: number; cancelled: number }) {
  db.tenant.count.mockImplementation(async (args?: { where?: Record<string, unknown> }) => {
    const where = args?.where ?? {}
    if (!where.tenantPayments) return 0 // counts alheios ao churn
    return where.status === "CANCELLED" ? cancelled : base
  })
}

/** Localiza as duas chamadas de `tenant.count` que formam a razão do churn. */
function churnCalls() {
  const wheres = db.tenant.count.mock.calls.map((c) => c[0]?.where ?? {})
  const base = wheres.find(
    (w) => w.tenantPayments?.some && w.status === undefined,
  )
  const cancelled = wheres.find(
    (w) => w.tenantPayments?.some && w.status === "CANCELLED",
  )
  return { base, cancelled }
}

describe("GET /api/admin/financeiro — base do churn", () => {
  it("divide canceladas-que-pagaram pela base de pagantes", async () => {
    countByWhere({ base: 91, cancelled: 4 })

    const res = await GET_FINANCEIRO(new Request("http://x/api/admin/financeiro"))
    const body = await res.json()

    expect(body.data.summary.churnRate).toBeCloseTo((4 / 91) * 100, 5)
    // `cancelledCount` sai do MESMO count do numerador — se a ordem inverter,
    // o card passa a exibir a base inteira como "canceladas".
    expect(body.data.summary.cancelledCount).toBe(4)
  })

  it("a base olha pagamento e exclui a PMB", async () => {
    db.tenant.count.mockResolvedValue(0)
    await GET_FINANCEIRO(new Request("http://x/api/admin/financeiro"))

    const { base, cancelled } = churnCalls()
    expect(base?.tenantPayments).toEqual({ some: EVER_PAID_PAYMENT_WHERE })
    expect(base?.slug).toEqual({ not: PMB_TENANT_SLUG })
    expect(cancelled?.tenantPayments).toEqual({ some: EVER_PAID_PAYMENT_WHERE })
    // `planValue > 0` era o proxy antigo de "pagante" — e é o valor de hoje.
    expect(base?.planValue).toBeUndefined()
  })

  it("MRR continua em planValue > 0 — só o churn mudou de base", async () => {
    db.tenant.count.mockResolvedValue(0)
    await GET_FINANCEIRO(new Request("http://x/api/admin/financeiro"))

    expect(db.tenant.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "ACTIVE", planValue: { gt: 0 } } }),
    )
  })
})

describe("GET /api/admin/analytics — base do churn", () => {
  it("usa a mesma base do financeiro", async () => {
    countByWhere({ base: 91, cancelled: 4 })

    const res = await GET_ANALYTICS(new Request("http://x/api/admin/analytics"))
    const body = await res.json()

    expect(body.data.kpis.churn).toBeCloseTo((4 / 91) * 100, 5)
  })

  it("não conta mais cortesia nem a PMB no denominador", async () => {
    db.tenant.count.mockResolvedValue(0)
    await GET_ANALYTICS(new Request("http://x/api/admin/analytics"))

    const { base, cancelled } = churnCalls()
    expect(base?.slug).toEqual({ not: PMB_TENANT_SLUG })
    expect(base?.tenantPayments).toEqual({ some: EVER_PAID_PAYMENT_WHERE })
    expect(cancelled?.status).toBe("CANCELLED")
  })
})
