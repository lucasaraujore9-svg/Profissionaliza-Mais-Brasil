import { describe, it, expect, vi, beforeEach } from "vitest"

/*
 * O que este arquivo protege: o cancelamento AUTOMÁTICO é a única ação do
 * sistema que encerra a assinatura de uma unidade no Asaas sem ninguém clicar.
 * Os testes abaixo são quase todos sobre quando ele NÃO pode acontecer.
 */

const db = vi.hoisted(() => ({
  tenant: { findMany: vi.fn(), update: vi.fn() },
  tenantPayment: { findFirst: vi.fn(), update: vi.fn() },
  tenantPaymentReminder: { createMany: vi.fn() },
}))
vi.mock("@/lib/prisma", () => ({ prisma: db }))

const asaas = vi.hoisted(() => {
  class AsaasApiError extends Error {
    statusCode: number
    constructor(message: string, statusCode: number) {
      super(message)
      this.statusCode = statusCode
    }
  }
  return { getPayment: vi.fn(), AsaasApiError }
})
vi.mock("@/lib/asaas/client", () => asaas)

const cancelTenant = vi.hoisted(() =>
  vi.fn(async () => ({
    ok: true as const,
    cancelledSubscriptions: 1,
    deletedCharges: 1,
    studentsBlocked: 0,
    warnings: [] as string[],
    before: { slug: "u", status: "SUSPENDED", hadSubscription: true, hadPromoSubscription: false },
  })),
)
vi.mock("@/lib/resellers/cancel", async (orig) => {
  const real = (await orig()) as Record<string, unknown>
  return { ...real, cancelTenant }
})

const blockTenantStudents = vi.hoisted(() =>
  vi.fn(async () => ({ affectedStudents: 3, errors: [] as string[] })),
)
vi.mock("@/lib/auto-block", () => ({ blockTenantStudents }))

const sendEmail = vi.hoisted(() => vi.fn(async () => ({ id: "e1" })))
vi.mock("@/lib/email/resend", () => ({ sendEmail }))

const createNotification = vi.hoisted(() => vi.fn(async () => null))
vi.mock("@/lib/notifications", () => ({ createNotification }))

const logAudit = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock("@/lib/audit", () => ({ logAudit }))

const invalidateTenantCache = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock("@/lib/tenant/cache-invalidation", () => ({ invalidateTenantCache }))

vi.mock("@/lib/logger", () => {
  const noop = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  return { logger: noop, contextLogger: () => noop }
})
vi.mock("@/lib/pmb-config", () => ({ PMB_TENANT_SLUG: "__pmb__" }))

import { runOverdueSweep } from "./overdue-sweep"

/** Argumentos da chamada `index` de um mock, sem depender da tipagem do vi.fn. */
function argsOf(fn: unknown, index = 0): Record<string, never>[] {
  return ((fn as { mock: { calls: unknown[][] } }).mock.calls[index] ??
    []) as Record<string, never>[]
}
function arg<T>(fn: unknown, position: number, index = 0): T {
  return argsOf(fn, index)[position] as unknown as T
}

const NOW = new Date("2026-08-21T09:00:00.000Z")

/** Unidade suspensa com uma mensalidade vencida há `ageDays` dias. */
function unidade(ageDays: number, overrides: Record<string, unknown> = {}) {
  const dueDate = new Date(Date.UTC(2026, 7, 21) - ageDays * 86_400_000)
  return {
    id: "t1",
    slug: "unidade-1",
    name: "Unidade 1",
    status: "SUSPENDED",
    customDomain: null,
    asaasSubscriptionId: "sub_1",
    asaasPromoSubscriptionId: null,
    billingMode: "AUTO",
    cancellationPolicy: null,
    owner: { email: "dono@x.com", name: "Dono" },
    tenantPayments: [
      {
        id: "tp1",
        amount: 239,
        dueDate,
        asaasPaymentId: "pay_1",
        installmentId: null,
      },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  db.tenant.findMany.mockResolvedValue([])
  db.tenant.update.mockResolvedValue({})
  db.tenantPayment.findFirst.mockResolvedValue(null)
  db.tenantPayment.update.mockResolvedValue({})
  db.tenantPaymentReminder.createMany.mockResolvedValue({ count: 1 })
  asaas.getPayment.mockResolvedValue({ id: "pay_1", status: "OVERDUE", paymentDate: null })
})

describe("cancelamento automático em D+7", () => {
  it("cancela, apaga as cobranças em aberto e deixa trilha de SISTEMA", async () => {
    db.tenant.findMany.mockResolvedValue([unidade(7)])

    const result = await runOverdueSweep({ now: NOW })

    expect(result.cancelled).toBe(1)
    expect(cancelTenant).toHaveBeenCalledTimes(1)
    expect(arg(cancelTenant, 1)).toEqual({
      // Política ausente => MANTÉM os alunos (o aluno pagou o curso dele).
      blockStudents: false,
      deleteOpenCharges: true,
    })
    const audit = arg<{
      action: string
      actorRole: string
      payloadAfter: { origem: string; ageDays: number }
    }>(logAudit, 0)
    expect(audit.action).toBe("tenant.cancel")
    expect(audit.actorRole).toBe("SYSTEM")
    expect(audit.payloadAfter.origem).toBe("auto_inadimplencia")
    expect(audit.payloadAfter.ageDays).toBe(7)
  })

  it("respeita a política da unidade para bloquear os alunos", async () => {
    db.tenant.findMany.mockResolvedValue([
      unidade(9, { cancellationPolicy: { keepStudentsActive: false } }),
    ])

    await runOverdueSweep({ now: NOW })

    expect(arg<{ blockStudents: boolean }>(cancelTenant, 1).blockStudents).toBe(true)
  })

  it("não cancela em D+6", async () => {
    db.tenant.findMany.mockResolvedValue([unidade(6)])
    const result = await runOverdueSweep({ now: NOW })
    expect(result.cancelled).toBe(0)
    expect(cancelTenant).not.toHaveBeenCalled()
  })

  it("não cancela unidade com autoCancel desligado", async () => {
    db.tenant.findMany.mockResolvedValue([
      unidade(30, { cancellationPolicy: { autoCancel: false } }),
    ])
    const result = await runOverdueSweep({ now: NOW })
    expect(result.cancelled).toBe(0)
    expect(cancelTenant).not.toHaveBeenCalled()
  })
})

describe("provas exigidas antes de destruir", () => {
  it("não cancela se o Asaas diz que a cobrança foi paga — e reconcilia a linha", async () => {
    db.tenant.findMany.mockResolvedValue([unidade(20)])
    asaas.getPayment.mockResolvedValue({
      id: "pay_1",
      status: "RECEIVED",
      paymentDate: "2026-08-10",
    })

    const result = await runOverdueSweep({ now: NOW })

    expect(cancelTenant).not.toHaveBeenCalled()
    expect(result.skippedCancellations[0].reason).toBe("pago_no_asaas")
    expect(db.tenantPayment.update).toHaveBeenCalledWith({
      where: { id: "tp1" },
      data: { status: "RECEIVED", paidAt: new Date("2026-08-10") },
    })
  })

  it("não cancela quando o Asaas está fora do ar (fail-closed)", async () => {
    db.tenant.findMany.mockResolvedValue([unidade(20)])
    asaas.getPayment.mockRejectedValue(new Error("ECONNRESET"))

    const result = await runOverdueSweep({ now: NOW })

    expect(cancelTenant).not.toHaveBeenCalled()
    expect(result.skippedCancellations[0].reason).toBe("asaas_indisponivel")
  })

  it("não cancela por cobrança que não existe mais no Asaas", async () => {
    db.tenant.findMany.mockResolvedValue([unidade(20)])
    asaas.getPayment.mockRejectedValue(new asaas.AsaasApiError("not found", 404))

    const result = await runOverdueSweep({ now: NOW })

    expect(cancelTenant).not.toHaveBeenCalled()
    expect(result.skippedCancellations[0].reason).toBe("cobranca_inexistente_no_asaas")
  })

  it("não cancela em estado inesperado do Asaas (estorno, chargeback)", async () => {
    db.tenant.findMany.mockResolvedValue([unidade(20)])
    asaas.getPayment.mockResolvedValue({ id: "pay_1", status: "REFUNDED", paymentDate: null })

    const result = await runOverdueSweep({ now: NOW })

    expect(cancelTenant).not.toHaveBeenCalled()
    expect(result.skippedCancellations[0].reason).toBe("asaas_status_REFUNDED")
  })

  it("não cancela quem já pagou um ciclo POSTERIOR (resíduo de webhook perdido)", async () => {
    db.tenant.findMany.mockResolvedValue([unidade(40)])
    db.tenantPayment.findFirst.mockResolvedValue({ id: "tp2" })

    const result = await runOverdueSweep({ now: NOW })

    expect(asaas.getPayment).not.toHaveBeenCalled()
    expect(cancelTenant).not.toHaveBeenCalled()
    expect(result.skippedCancellations[0].reason).toBe("cobranca_posterior_paga")
  })

  it("não cancela mensalidade parcelada no cartão (id de parcelamento)", async () => {
    db.tenant.findMany.mockResolvedValue([
      unidade(20, {
        tenantPayments: [
          {
            id: "tp1",
            amount: 239,
            dueDate: new Date("2026-08-01T00:00:00.000Z"),
            asaasPaymentId: "ins_1",
            installmentId: "ins_1",
          },
        ],
      }),
    ])

    const result = await runOverdueSweep({ now: NOW })

    expect(cancelTenant).not.toHaveBeenCalled()
    expect(result.skippedCancellations[0].reason).toBe("mensalidade_parcelada_no_cartao")
  })

  it("cancelamento adiado ainda TIRA DO AR a unidade que segue vendendo", async () => {
    // `overdueAction` testa "cancel" antes de "suspend": pular a unidade quando
    // a prova falha deixava uma ACTIVE e 20 dias vencida vendendo para sempre —
    // nunca cancelada (a prova falha SEMPRE nesta cobrança) e nunca suspensa,
    // porque o ramo de suspensão ficava abaixo do `continue`.
    db.tenant.findMany.mockResolvedValue([
      unidade(20, {
        status: "ACTIVE",
        tenantPayments: [
          {
            id: "tp1",
            amount: 239,
            dueDate: new Date("2026-08-01T00:00:00.000Z"),
            asaasPaymentId: "ins_1",
            installmentId: "ins_1",
          },
        ],
      }),
    ])

    const result = await runOverdueSweep({ now: NOW })

    expect(cancelTenant).not.toHaveBeenCalled()
    expect(result.skippedCancellations[0].reason).toBe("mensalidade_parcelada_no_cartao")
    expect(result.suspended).toBe(1)
    expect(db.tenant.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { status: "SUSPENDED" },
    })
  })

  it("cancelamento adiado numa unidade JÁ suspensa não a suspende de novo", async () => {
    db.tenant.findMany.mockResolvedValue([
      unidade(20, {
        tenantPayments: [
          {
            id: "tp1",
            amount: 239,
            dueDate: new Date("2026-08-01T00:00:00.000Z"),
            asaasPaymentId: "ins_1",
            installmentId: "ins_1",
          },
        ],
      }),
    ])

    const result = await runOverdueSweep({ now: NOW })

    expect(result.suspended).toBe(0)
    expect(db.tenant.update).not.toHaveBeenCalled()
  })

  it("a consulta ignora cobrança já quitada e a própria PMB", async () => {
    await runOverdueSweep({ now: NOW })
    const { where } = arg<{
      where: {
        slug: unknown
        tenantPayments: { some: unknown }
      }
    }>(db.tenant.findMany, 0)
    expect(where.slug).toEqual({ not: "__pmb__" })
    expect(where.tenantPayments.some).toEqual({
      status: "OVERDUE",
      paidAt: null,
      markedPaidAt: null,
    })
  })
})

describe("suspensão e aviso", () => {
  it("suspende em D+3 e bloqueia os alunos quando billingMode é AUTO", async () => {
    // Padrão da SUSPENSÃO é o oposto do padrão do CANCELAMENTO: aqui, sem
    // política, o aluno É bloqueado — comportamento que já rodava em produção.
    db.tenant.findMany.mockResolvedValue([unidade(3, { status: "ACTIVE" })])

    const result = await runOverdueSweep({ now: NOW })

    expect(result.suspended).toBe(1)
    expect(db.tenant.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { status: "SUSPENDED" },
    })
    expect(blockTenantStudents).toHaveBeenCalledWith("t1")
    expect(result.studentsBlocked).toBe(3)
  })

  it("o e-mail da suspensão já anuncia a data do cancelamento", async () => {
    db.tenant.findMany.mockResolvedValue([unidade(3, { status: "ACTIVE" })])

    await runOverdueSweep({ now: NOW })

    const { description: descricao } = arg<{
      template: { props: { description: string } }
    }>(sendEmail, 0).template.props
    // Vencida em 18/08 + 7 dias = 25/08.
    expect(descricao).toContain("25/08/2026")
    expect(descricao).toContain("CANCELADA")
  })

  it("avisa uma única vez em D+5, reivindicando a janela na tabela de lembretes", async () => {
    db.tenant.findMany.mockResolvedValue([unidade(5)])

    const result = await runOverdueSweep({ now: NOW })

    expect(result.warned).toBe(1)
    expect(db.tenantPaymentReminder.createMany).toHaveBeenCalledWith({
      data: [{ tenantPaymentId: "tp1", offsetDays: -5 }],
      skipDuplicates: true,
    })
  })

  it("não repete o aviso quando a janela já foi reivindicada", async () => {
    db.tenant.findMany.mockResolvedValue([unidade(6)])
    db.tenantPaymentReminder.createMany.mockResolvedValue({ count: 0 })

    const result = await runOverdueSweep({ now: NOW })

    expect(result.warned).toBe(0)
    expect(createNotification).not.toHaveBeenCalled()
  })
})

describe("dry-run", () => {
  it("relata quem seria cancelado sem escrever, sem chamar o Asaas e sem avisar", async () => {
    db.tenant.findMany.mockResolvedValue([unidade(9), unidade(3, { status: "ACTIVE" })])

    const result = await runOverdueSweep({ now: NOW, dryRun: true })

    expect(result.cancelled).toBe(1)
    expect(result.cancelledTenants[0]).toMatchObject({ slug: "unidade-1", ageDays: 9 })
    expect(result.suspended).toBe(1)
    expect(cancelTenant).not.toHaveBeenCalled()
    expect(asaas.getPayment).not.toHaveBeenCalled()
    expect(db.tenant.update).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
    expect(createNotification).not.toHaveBeenCalled()
    expect(logAudit).not.toHaveBeenCalled()
  })
})

describe("falha parcial", () => {
  it("uma unidade que falha não derruba a varredura", async () => {
    db.tenant.findMany.mockResolvedValue([unidade(7), unidade(7)])
    cancelTenant
      .mockResolvedValueOnce({ ok: false, status: 502, error: "Asaas fora" } as never)
      .mockResolvedValueOnce({
        ok: true,
        cancelledSubscriptions: 1,
        deletedCharges: 1,
        studentsBlocked: 0,
        warnings: [],
        before: { slug: "u", status: "SUSPENDED", hadSubscription: true, hadPromoSubscription: false },
      } as never)

    const result = await runOverdueSweep({ now: NOW })

    expect(result.cancelled).toBe(1)
    expect(result.skippedCancellations[0].reason).toContain("falha_asaas")
    expect(result.errors).toHaveLength(1)
  })
})
