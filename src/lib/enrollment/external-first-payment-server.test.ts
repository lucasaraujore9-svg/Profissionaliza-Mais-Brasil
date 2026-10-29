import { describe, it, expect, vi, beforeEach } from "vitest"

// Venda com a 1ª mensalidade paga no marketplace. O que precisa ser provado: a
// baixa usa o fluxo normal de pagamento confirmado (libera o curso), o id `ext_`
// nunca fica na matrícula (é onde verificação/cancelamento procuram a cobrança
// no gateway), o MP agenda as parcelas 2..N, e falha desfaz tudo.

vi.mock("@/lib/prisma", () => ({
  prisma: {
    enrollment: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    student: { update: vi.fn() },
    payment: { findFirst: vi.fn() },
  },
}))
vi.mock("@/lib/enrollment/fulfill", () => ({ fulfillEnrollment: vi.fn() }))
vi.mock("@/lib/enrollment/multi-course-server", () => ({
  rollbackSaleEnrollment: vi.fn(async () => undefined),
}))
vi.mock("@/lib/installments/plan", () => ({ createMpPlanAfterExternalFirst: vi.fn() }))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { prisma } from "@/lib/prisma"
import { fulfillEnrollment } from "@/lib/enrollment/fulfill"
import { rollbackSaleEnrollment } from "@/lib/enrollment/multi-course-server"
import { createMpPlanAfterExternalFirst } from "@/lib/installments/plan"
import { sellWithExternalFirstPayment, type ExternalSaleInput } from "./external-first-payment-server"

const p = prisma as unknown as {
  enrollment: Record<"create" | "update" | "updateMany", ReturnType<typeof vi.fn>>
  student: { update: ReturnType<typeof vi.fn> }
}

const NOW = new Date("2026-10-29T15:00:00Z")
const tenantCtx = { id: "t1", slug: "loja", plataformaVendedorId: null }
const endereco = { cep: "01001000", rua: "Rua A", numero: "1", bairro: "Centro", cidade: "SP", estado: "SP" }

function input(over: Partial<ExternalSaleInput> = {}): ExternalSaleInput {
  return {
    tenantId: "t1",
    fulfillTenant: tenantCtx,
    studentId: "s1",
    soldByUserId: "u1",
    gateway: "ASAAS",
    isMonthly: true,
    months: 12,
    paidAtYmd: "2026-10-20",
    enrollment: {
      tenantCourseId: "tc1",
      courseId: "c1",
      bundleCourseIds: [],
      originalAmount: 99,
      discountAmount: 0,
      finalAmount: 99,
      couponId: null,
      splitSnapshot: null,
    },
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  p.enrollment.create.mockResolvedValue({ id: "enr1" })
})

describe("sellWithExternalFirstPayment", () => {
  it("Asaas: mensal com a 1ª baixada pelo fluxo normal e o id ext_ fora da matrícula", async () => {
    const res = await sellWithExternalFirstPayment(input(), NOW)

    expect(res).toMatchObject({ ok: true, summary: { remaining: 11, nextDueDate: "2026-11-20" } })
    expect(p.enrollment.create.mock.calls[0][0].data).toMatchObject({
      paymentType: "MONTHLY",
      installmentsTotal: 12,
      finalAmount: 99,
    })
    expect(fulfillEnrollment).toHaveBeenCalledWith(
      tenantCtx,
      "enr1",
      expect.objectContaining({
        gateway: "ASAAS",
        externalPaymentId: "ext_enr1",
        amount: 99,
        paidAt: new Date("2026-10-20T12:00:00Z"),
        mpPaymentType: "pagamento_externo",
      }),
    )
    expect(p.enrollment.updateMany).toHaveBeenCalledWith({
      where: { id: "enr1", asaasPaymentId: "ext_enr1" },
      data: { asaasPaymentId: null },
    })
    expect(createMpPlanAfterExternalFirst).not.toHaveBeenCalled()
  })

  it("MP: carnê das parcelas 2..N agendado ANTES da baixa liberar o curso", async () => {
    const res = await sellWithExternalFirstPayment(input({ gateway: "MP", endereco }), NOW)

    expect(res.ok).toBe(true)
    expect(p.enrollment.create.mock.calls[0][0].data).toMatchObject({
      paymentType: "BOLETO_INSTALLMENT",
      finalAmount: 1188, // carnê inteiro, como todo carnê
    })
    expect(createMpPlanAfterExternalFirst).toHaveBeenCalledWith(
      expect.objectContaining({ count: 12, installmentValue: 99 }),
    )
    expect(
      vi.mocked(createMpPlanAfterExternalFirst).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(fulfillEnrollment).mock.invocationCallOrder[0])
    expect(fulfillEnrollment).toHaveBeenCalledWith(
      tenantCtx,
      "enr1",
      expect.objectContaining({ gateway: "MP", paymentType: "BOLETO_INSTALLMENT", amount: 99 }),
    )
  })

  it("falha no meio desfaz a matrícula", async () => {
    vi.mocked(fulfillEnrollment).mockRejectedValueOnce(new Error("plataforma fora"))
    const res = await sellWithExternalFirstPayment(input(), NOW)
    expect(res).toMatchObject({ ok: false, status: 502 })
    expect(rollbackSaleEnrollment).toHaveBeenCalledWith("enr1")
  })

  it("recusa antes de criar qualquer coisa", async () => {
    for (const bad of [
      input({ isMonthly: false }),
      input({ months: 1 }),
      input({ paidAtYmd: "2026-10-30" }), // futuro
      input({ gateway: "MP" }), // sem endereço
      input({ gateway: "MP", tenantId: null, endereco }), // vitrine PMB só no Asaas
    ]) {
      const res = await sellWithExternalFirstPayment(bad, NOW)
      expect(res.ok).toBe(false)
    }
    expect(p.enrollment.create).not.toHaveBeenCalled()
  })
})
