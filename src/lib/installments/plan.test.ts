import { describe, it, expect, vi, beforeEach } from "vitest"

// Carnê Asaas com a 1ª mensalidade paga fora (marketplace): ela é a parcela 1,
// PAGA e sem boleto; os boletos gerados viram as parcelas 2..N+1. Errar a
// numeração faria a parcela 1 do Asaas "liberar" de novo o que já foi pago.

vi.mock("@/lib/prisma", () => ({
  prisma: {
    enrollment: { findUnique: vi.fn(), update: vi.fn() },
    boletoInstallment: { create: vi.fn() },
  },
}))
vi.mock("@/lib/asaas/client", () => ({
  AsaasApiError: class extends Error {},
  decryptTenantAsaasKey: vi.fn(),
  findOrCreateAsaasCustomer: vi.fn(async () => ({ customer: { id: "cus_1" } })),
  getCustomer: vi.fn(async () => ({ id: "cus_1", deleted: false })),
  createInstallmentWithBoleto: vi.fn(async () => ({ id: "ins_1" })),
  getInstallmentPayments: vi.fn(async () => ({
    data: [
      { id: "pay_b", value: 53.84, dueDate: "2026-12-28", bankSlipUrl: "b.pdf" },
      { id: "pay_a", value: 53.84, dueDate: "2026-11-28", bankSlipUrl: "a.pdf" },
    ],
  })),
  deleteInstallment: vi.fn(),
  updatePayment: vi.fn(),
  motherAsaasKey: () => "mother",
}))
vi.mock("@/lib/mercadopago/client", () => ({ decryptTenantMpToken: vi.fn(), createPayment: vi.fn() }))
vi.mock("@/lib/course-authoring/split-server", () => ({ asaasSplitsForEnrollment: vi.fn(async () => undefined) }))
vi.mock("@/lib/tenant/urls", () => ({ asaasWebhookUrl: () => "https://x/wh", mpWebhookUrl: () => "" }))
vi.mock("@/lib/checkout/payer", () => ({
  PAYER_SELECT: {},
  resolvePayer: () => ({ nome: "Lorena", cpf: "11418766550", email: "l@x", fone: null, asaasCustomerId: "cus_1", asaasExternalReference: "student_1" }),
}))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { prisma } from "@/lib/prisma"
import { createBoletoInstallmentPlan } from "./plan"

const p = prisma as unknown as {
  enrollment: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  boletoInstallment: { create: ReturnType<typeof vi.fn> }
}

beforeEach(() => {
  vi.clearAllMocks()
  p.enrollment.findUnique.mockResolvedValue({
    id: "enr1",
    tenantId: null,
    externalReference: null,
    course: { nome: "Cílios" },
    student: { id: "s1", cpf: "11418766550" },
    tenant: null,
  })
  p.boletoInstallment.create.mockImplementation(async ({ data }) => data)
})

describe("createBoletoInstallmentPlan — 1ª paga fora", () => {
  it("parcela 1 paga sem boleto; boletos do Asaas numerados a partir da 2ª, por vencimento", async () => {
    const paidAt = new Date("2026-10-28T12:00:00Z")
    const res = await createBoletoInstallmentPlan({
      enrollmentId: "enr1",
      count: 2,
      installmentValue: 53.84,
      firstDueDate: new Date("2026-11-28T12:00:00Z"),
      paidBefore: { paidAt, amount: 53.84 },
    })

    const rows = p.boletoInstallment.create.mock.calls.map((c) => c[0].data)
    expect(rows.map((r) => [r.number, r.status, r.asaasPaymentId ?? null])).toEqual([
      [1, "PAID", null],
      [2, "GENERATED", "pay_a"],
      [3, "GENERATED", "pay_b"],
    ])
    expect(rows[0].paidAt).toEqual(paidAt)
    // O link devolvido é o do 1º BOLETO, não da parcela já paga.
    expect(res.firstBoletoUrl).toBe("a.pdf")
  })
})
