import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscriptionPayment: { findFirst: vi.fn(), create: vi.fn() },
    studentSubscription: { findUnique: vi.fn(), update: vi.fn() },
  },
}))
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn(async () => null) }))
vi.mock("@/lib/errors", () => ({ swallow: () => () => undefined }))
vi.mock("./cancel", () => ({ cancelSubscriptionAccess: vi.fn(async () => ({})) }))
vi.mock("@/lib/logger", () => {
  const noop = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  return { contextLogger: () => noop, logger: noop }
})

import { prisma } from "@/lib/prisma"
import { createNotification } from "@/lib/notifications"
import { settleSubscriptionCycle, markSubscriptionPastDue } from "./renew"

const findPay = prisma.subscriptionPayment.findFirst as unknown as ReturnType<typeof vi.fn>
const createPay = prisma.subscriptionPayment.create as unknown as ReturnType<typeof vi.fn>
const findSub = prisma.studentSubscription.findUnique as unknown as ReturnType<typeof vi.fn>
const updateSub = prisma.studentSubscription.update as unknown as ReturnType<typeof vi.fn>
const notify = createNotification as unknown as ReturnType<typeof vi.fn>

const PAID = new Date("2026-08-20T12:00:00Z")

function event(over: Record<string, unknown> = {}) {
  return {
    gateway: "ASAAS" as const,
    externalPaymentId: "pay_1",
    amount: 49.9,
    paidAt: PAID,
    dueDate: PAID,
    ...over,
  }
}

function sub(over: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    tenantId: null,
    status: "ACTIVE",
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    studentId: "st_1",
    plan: { name: "Plano Total" },
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  findPay.mockResolvedValue(null)
  findSub.mockResolvedValue(sub())
})

describe("settleSubscriptionCycle", () => {
  it("registra o ciclo e empurra o periodo um mes", async () => {
    const r = await settleSubscriptionCycle("sub_1", event())
    expect(r.settled).toBe(true)
    const data = updateSub.mock.calls[0][0].data
    expect(data.status).toBe("ACTIVE")
    expect(data.currentPeriodEnd.toISOString()).toBe("2026-09-20T12:00:00.000Z")
  })

  it("re-entrega do webhook NAO concede mes extra", async () => {
    // Um `currentPeriodEnd += 1 mês` cego daria acesso de graça a cada
    // reentrega do gateway.
    findPay.mockResolvedValue({ id: "sp_1" })
    const r = await settleSubscriptionCycle("sub_1", event())
    expect(r.settled).toBe(false)
    expect(createPay).not.toHaveBeenCalled()
    expect(updateSub).not.toHaveBeenCalled()
  })

  it("renovacao antecipada soma sobre o ciclo vigente, sem encurtar", async () => {
    // Pagou dia 20 um ciclo que só vence dia 30: o novo fim é 30+1mês, não
    // 20+1mês — senão o aluno perde os 10 dias que já tinha pago.
    findSub.mockResolvedValue(
      sub({ currentPeriodEnd: new Date("2026-08-30T12:00:00Z") }),
    )
    await settleSubscriptionCycle("sub_1", event())
    expect(
      updateSub.mock.calls[0][0].data.currentPeriodEnd.toISOString(),
    ).toBe("2026-09-30T12:00:00.000Z")
  })

  it("ciclo ja vencido nao gera credito retroativo", async () => {
    // Fim do ciclo em junho, pagamento em agosto: o novo ciclo conta de agosto,
    // não de junho — senão ele pagaria um mês e receberia zero dia de acesso.
    findSub.mockResolvedValue(
      sub({ currentPeriodEnd: new Date("2026-06-01T12:00:00Z") }),
    )
    await settleSubscriptionCycle("sub_1", event())
    expect(
      updateSub.mock.calls[0][0].data.currentPeriodEnd.toISOString(),
    ).toBe("2026-09-20T12:00:00.000Z")
  })

  it("pagar tira a assinatura de PAST_DUE", async () => {
    findSub.mockResolvedValue(
      sub({ status: "PAST_DUE", currentPeriodEnd: new Date("2026-08-10T12:00:00Z") }),
    )
    await settleSubscriptionCycle("sub_1", event())
    expect(updateSub.mock.calls[0][0].data.status).toBe("ACTIVE")
  })

  it("fim de mes nao estoura (31/01 -> 28/02)", async () => {
    findSub.mockResolvedValue(
      sub({ currentPeriodEnd: new Date("2027-01-31T12:00:00Z") }),
    )
    await settleSubscriptionCycle("sub_1", event())
    expect(
      updateSub.mock.calls[0][0].data.currentPeriodEnd.toISOString(),
    ).toBe("2027-02-28T12:00:00.000Z")
  })

  it("assinatura CANCELADA nao ressuscita com pagamento tardio", async () => {
    // Enquanto a recorrência seguia viva no gateway, a cobrança do mês seguinte
    // reabria a linha como ACTIVE — o aluno via "assinatura ativa" com TODAS as
    // matrículas canceladas e o acesso já revogado na fornecedora.
    findSub.mockResolvedValue(sub({ status: "CANCELLED" }))
    const r = await settleSubscriptionCycle("sub_1", event())
    expect(r.settled).toBe(false)
    expect(updateSub).not.toHaveBeenCalled()
    // O dinheiro não some do histórico, e o admin é avisado da órfã.
    expect(createPay).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it("assinatura EXPIRED tambem nao ressuscita", async () => {
    findSub.mockResolvedValue(sub({ status: "EXPIRED" }))
    const r = await settleSubscriptionCycle("sub_1", event())
    expect(r.settled).toBe(false)
    expect(updateSub).not.toHaveBeenCalled()
  })

  it("idempotencia olha o gateway certo", async () => {
    await settleSubscriptionCycle("sub_1", event({ gateway: "MP", externalPaymentId: "mp_9" }))
    expect(findPay.mock.calls[0][0].where).toEqual({ mpPaymentId: "mp_9" })
  })
})

describe("markSubscriptionPastDue", () => {
  it("marca em atraso mas NAO corta o acesso", async () => {
    // Cortar aqui derrubaria quem paga a fatura com um dia de folga — PIX e
    // boleto não têm débito automático.
    await markSubscriptionPastDue("sub_1")
    expect(updateSub.mock.calls[0][0].data).toEqual({ status: "PAST_DUE" })
  })

  it("nao reabre assinatura ja encerrada", async () => {
    findSub.mockResolvedValue(sub({ status: "CANCELLED" }))
    await markSubscriptionPastDue("sub_1")
    expect(updateSub).not.toHaveBeenCalled()
  })
})
