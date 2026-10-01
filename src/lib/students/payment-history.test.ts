import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Histórico de pagamentos do painel do aluno. O ciclo de assinatura mora em
 * `subscription_payments`; enquanto a tela só lia `payments`, o assinante via
 * "Total pago R$ 0,00 — nenhum pagamento confirmado" com a assinatura paga e
 * ativa (Capacita Pró Brasil, 01/10/2026).
 */

const db = vi.hoisted(() => ({
  payment: { findMany: vi.fn() },
  subscriptionPayment: { findMany: vi.fn() },
}))
vi.mock("@/lib/prisma", () => ({ prisma: db }))

import { loadStudentPaymentHistory } from "./payment-history"

const day = (d: string) => new Date(`${d}T12:00:00Z`)

beforeEach(() => {
  vi.clearAllMocks()
  db.payment.findMany.mockResolvedValue([
    { id: "p1", amount: 100, paidAt: day("2026-09-10"), mpStatus: "APPROVED", enrollment: { course: { nome: "Excel" } } },
    { id: "p2", amount: 50, paidAt: day("2026-08-01"), mpStatus: "APPROVED", enrollment: { course: { nome: "Word" } } },
  ])
  db.subscriptionPayment.findMany.mockResolvedValue([
    { id: "s1", amount: 34.9, paidAt: day("2026-10-01"), subscription: { plan: { name: "Combo Beauty" } } },
    { id: "s2", amount: 34.9, paidAt: day("2026-09-01"), subscription: { plan: { name: "Combo Beauty" } } },
  ])
})

describe("loadStudentPaymentHistory", () => {
  it("junta curso e ciclo de assinatura, do mais recente para o mais antigo", async () => {
    const rows = await loadStudentPaymentHistory("stu_1")
    expect(rows.map((r) => r.id)).toEqual(["s1", "p1", "s2", "p2"])
    expect(rows[0]).toEqual({
      id: "s1",
      label: "Assinatura — Combo Beauty",
      amount: 34.9,
      paidAt: day("2026-10-01"),
      status: "APPROVED",
    })
    expect(rows[1]).toMatchObject({ label: "Excel", amount: 100, status: "APPROVED" })
  })

  it("só ciclo PAGO e não estornado, e só do próprio aluno", async () => {
    await loadStudentPaymentHistory("stu_1")
    expect(db.subscriptionPayment.findMany.mock.calls[0][0].where).toEqual({
      subscription: { studentId: "stu_1" },
      paidAt: { not: null },
      status: { not: "REFUNDED" },
    })
    expect(db.payment.findMany.mock.calls[0][0].where).toEqual({
      enrollment: { studentId: "stu_1" },
    })
  })

  it("`take` corta DEPOIS de juntar — o ciclo recente não some atrás de 5 cursos", async () => {
    const rows = await loadStudentPaymentHistory("stu_1", 2)
    expect(rows.map((r) => r.id)).toEqual(["s1", "p1"])
    expect(db.payment.findMany.mock.calls[0][0].take).toBe(2)
    expect(db.subscriptionPayment.findMany.mock.calls[0][0].take).toBe(2)
  })
})
