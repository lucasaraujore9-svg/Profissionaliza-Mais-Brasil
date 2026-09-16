import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Varredura diária da assinatura no boleto: é ela que faz a assinatura
 * "renovar sozinha" e que para de emitir boleto para quem nunca assinou.
 */

const db = vi.hoisted(() => ({
  studentSubscription: { findMany: vi.fn() },
  subscriptionPayment: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  },
}))
vi.mock("@/lib/prisma", () => ({ prisma: db }))
vi.mock("@/lib/logger", () => {
  const noop = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  return { contextLogger: () => noop, logger: noop }
})
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn(async () => null) }))
vi.mock("@/lib/errors", () => ({ swallow: () => () => undefined }))
vi.mock("./cancel", () => ({ cancelSubscriptionAccess: vi.fn(async () => ({})) }))
vi.mock("./carne", () => ({ emitCarneRow: vi.fn() }))

import { createNotification } from "@/lib/notifications"
import { cancelSubscriptionAccess } from "./cancel"
import { emitCarneRow } from "./carne"
import { runSubscriptionCarneSweep } from "./carne-sweep"

const cancel = cancelSubscriptionAccess as unknown as ReturnType<typeof vi.fn>
const emit = emitCarneRow as unknown as ReturnType<typeof vi.fn>
const notify = createNotification as unknown as ReturnType<typeof vi.fn>

const NOW = new Date("2026-11-04T12:00:00Z")

beforeEach(() => {
  vi.clearAllMocks()
  db.studentSubscription.findMany.mockResolvedValue([])
  db.subscriptionPayment.findMany.mockResolvedValue([])
  db.subscriptionPayment.findFirst.mockResolvedValue(null)
  db.subscriptionPayment.updateMany.mockResolvedValue({ count: 1 })
})

describe("runSubscriptionCarneSweep", () => {
  it("carnê ABANDONADO é encerrado (e os boletos seguintes, cancelados)", async () => {
    db.studentSubscription.findMany.mockResolvedValueOnce([{ id: "sub_abandoned" }])

    const r = await runSubscriptionCarneSweep(NOW)

    expect(r.abandoned).toBe(1)
    expect(cancel).toHaveBeenCalledWith("sub_abandoned", "PAST_DUE", false)
    const where = db.studentSubscription.findMany.mock.calls[0][0].where
    // Só quem NUNCA pagou, e só depois da carência do 1º boleto.
    expect(where).toMatchObject({ boletoCarne: true, status: "PENDING", startedAt: null })
    expect(where.payments.some.number).toBe(1)
    expect(where.payments.some.dueDate.lt.toISOString()).toBe("2026-10-28T12:00:00.000Z")
  })

  it("RENOVA sozinha: último boleto na janela → cria o seguinte, pelo preço congelado", async () => {
    db.studentSubscription.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "sub_1", tenantId: "ten_1", interval: "MONTHLY", priceAtPurchase: 49.9, gateway: "MP" },
      ])
    db.subscriptionPayment.findFirst
      .mockResolvedValueOnce({ dueDate: new Date("2026-09-10T12:00:00Z") })
      .mockResolvedValueOnce({ number: 3 })

    const r = await runSubscriptionCarneSweep(NOW)

    expect(r.appended).toBe(1)
    const data = db.subscriptionPayment.create.mock.calls[0][0].data
    expect(data).toMatchObject({
      subscriptionId: "sub_1",
      tenantId: "ten_1",
      number: 4,
      amount: 49.9,
      gateway: "MP",
      status: "SCHEDULED",
    })
    expect(data.dueDate.toISOString()).toBe("2026-12-10T12:00:00.000Z")

    // Renova só assinatura que já começou, recorrente, sem boleto além da janela.
    const where = db.studentSubscription.findMany.mock.calls[1][0].where
    expect(where).toMatchObject({
      boletoCarne: true,
      status: { in: ["ACTIVE", "PAST_DUE"] },
      startedAt: { not: null },
      interval: { not: "LIFETIME" },
    })
  })

  it("emite o que entrou na janela e avisa o aluno dos boletos de renovação", async () => {
    const subscription = {
      id: "sub_1",
      studentId: "stu_1",
      tenantId: "ten_1",
      plan: { name: "Plano Total" },
    }
    db.subscriptionPayment.findMany
      .mockResolvedValueOnce([
        { id: "row_1", number: 1, subscription },
        { id: "row_2", number: 2, subscription },
        { id: "row_3", number: 3, subscription },
        { id: "row_4", number: 4, subscription },
      ])
      .mockResolvedValueOnce([])
    emit
      .mockResolvedValueOnce({ status: "emitted", boleto: null })
      .mockResolvedValueOnce({ status: "emitted", boleto: null })
      .mockResolvedValueOnce({ status: "busy" })
      .mockRejectedValueOnce(new Error("MP fora"))

    const r = await runSubscriptionCarneSweep(NOW)

    expect(r.emitted).toBe(2)
    expect(r.emitErrors).toBe(1)
    // O 1º boleto é mostrado na venda; o aviso é para os que chegam depois.
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0][0]).toMatchObject({ audience: "STUDENT", studentId: "stu_1" })

    const where = db.subscriptionPayment.findMany.mock.calls[0][0].where
    expect(where.subscription.status.in).toEqual(["PENDING", "ACTIVE", "PAST_DUE"])
    expect(where.dueDate.lte.toISOString()).toBe("2026-11-11T12:00:00.000Z")
  })

  it("boleto vencido vira OVERDUE só depois do fim do dia do vencimento", async () => {
    db.subscriptionPayment.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "venceu_ontem", dueDate: new Date("2026-11-03T12:00:00Z"), status: "PENDING" },
        { id: "vence_hoje", dueDate: new Date("2026-11-04T00:00:00Z"), status: "PENDING" },
      ])

    const r = await runSubscriptionCarneSweep(NOW)

    expect(r.markedOverdue).toBe(1)
    expect(db.subscriptionPayment.updateMany).toHaveBeenCalledTimes(1)
    expect(db.subscriptionPayment.updateMany.mock.calls[0][0].where.id).toBe("venceu_ontem")
  })
})
