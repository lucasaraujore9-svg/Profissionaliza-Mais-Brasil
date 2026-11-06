import { beforeEach, describe, expect, it, vi } from "vitest"
import type { BoletoInstallment } from "@prisma/client"

// O meio do parcelado é fixado pela linha PAGA (não pela cobrança criada), e
// só pelo meio que pagou. Linhas fora do parcelado não mudam.

vi.mock("@/lib/prisma", () => ({
  prisma: {
    enrollment: {
      findUnique: vi.fn(async () => ({ id: "enr_1", status: "ACTIVE", studentId: "s1" })),
      updateMany: vi.fn(async () => ({ count: 1 })),
      update: vi.fn(),
    },
    boletoInstallment: { update: vi.fn(async () => ({})), findMany: vi.fn(async () => []) },
  },
}))
vi.mock("@/lib/enrollment/fulfill", () => ({ fulfillEnrollment: vi.fn(async () => undefined) }))
vi.mock("@/lib/enrollment/pace", () => ({
  evaluatePaceGate: vi.fn(async () => undefined),
  evaluateSatellitePaceGates: vi.fn(async () => undefined),
}))
vi.mock("@/lib/students/plataforma-actions", () => ({ unblockStudentInEA: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn(async () => undefined) }))

import { prisma } from "@/lib/prisma"
import { settleBoletoInstallment } from "./settle"

const tenant = { id: "t1", slug: "loja", plataformaVendedorId: null, isPmbVitrine: false }
const event = { gateway: "ASAAS" as const, externalPaymentId: "pay_1", amount: 100, paidAt: new Date() }

const settle = (row: Partial<BoletoInstallment>) =>
  settleBoletoInstallment({
    installment: { id: "r2", enrollmentId: "enr_1", number: 2, method: null, cardDeclinedAt: null, ...row } as BoletoInstallment,
    tenant: tenant as never,
    event,
  })

beforeEach(() => vi.clearAllMocks())

describe("settleBoletoInstallment — meio do parcelado", () => {
  it("linha paga em PIX num plano de cartão negado grava installmentMethod PIX", async () => {
    await settle({ method: "PIX", cardDeclinedAt: new Date() })
    expect(prisma.enrollment.updateMany).toHaveBeenCalledWith({
      where: {
        id: "enr_1",
        flexInstallments: true,
        OR: [{ installmentMethod: null }, { installmentMethod: "CREDIT_CARD" }],
      },
      data: { installmentMethod: "PIX" },
    })
    const paid = vi.mocked(prisma.boletoInstallment.update).mock.invocationCallOrder[0]
    expect(paid).toBeLessThan(vi.mocked(prisma.enrollment.updateMany).mock.invocationCallOrder[0])
  })

  it("linha sem cartão negado: só fixa quando o meio ainda é nulo", async () => {
    await settle({ method: "BOLETO" })
    expect(prisma.enrollment.updateMany).toHaveBeenCalledWith({
      where: { id: "enr_1", flexInstallments: true, OR: [{ installmentMethod: null }] },
      data: { installmentMethod: "BOLETO" },
    })
  })

  it("linha 1 paga em PIX: a entrada não define o meio", async () => {
    await settle({ number: 1, method: "PIX" })
    expect(prisma.enrollment.updateMany).toHaveBeenCalledWith({
      where: { id: "enr_1", flexInstallments: true, flexHasDownPayment: false, OR: [{ installmentMethod: null }] },
      data: { installmentMethod: "PIX" },
    })
  })

  it.each([null, "CREDIT_CARD"] as const)("linha paga com method %s (carnê antigo / cartão) não mexe no meio", async (method) => {
    await settle({ method })
    expect(prisma.enrollment.updateMany).not.toHaveBeenCalled()
    expect(prisma.boletoInstallment.update).toHaveBeenCalledWith({
      where: { id: "r2" },
      data: { status: "PAID", paidAt: event.paidAt },
    })
  })
})
