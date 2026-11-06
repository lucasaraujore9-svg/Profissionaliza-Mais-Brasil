import { describe, it, expect, vi, beforeEach } from "vitest"

// Renegociação de parcela do carnê. O que precisa ser provado: o gateway muda
// ANTES do banco, parcela paga (aqui ou lá) nunca é reprecificada, e no MP o
// boleto antigo é cancelado antes de sair o novo — senão o aluno teria dois
// boletos vivos para a mesma parcela.

vi.mock("@/lib/prisma", () => ({
  prisma: {
    boletoInstallment: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    enrollment: { update: vi.fn() },
  },
}))
vi.mock("@/lib/enrollment/gateway-credentials", () => ({
  resolveEnrollmentGatewayKeys: vi.fn(async () => ({ asaasApiKey: "k", mpAccessToken: "t" })),
}))
vi.mock("@/lib/asaas/client", () => ({
  AsaasApiError: class extends Error {},
  getPayment: vi.fn(),
  updatePayment: vi.fn(),
}))
vi.mock("@/lib/mercadopago/client", () => ({
  MPApiError: class extends Error {},
  getPayment: vi.fn(),
  cancelPayment: vi.fn(),
}))
vi.mock("./plan", () => ({ generateMpBoletoForInstallment: vi.fn() }))
vi.mock("./settle", () => ({ maybeReactivate: vi.fn(async () => undefined) }))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { prisma } from "@/lib/prisma"
import * as asaas from "@/lib/asaas/client"
import * as mp from "@/lib/mercadopago/client"
import { generateMpBoletoForInstallment } from "./plan"
import { maybeReactivate } from "./settle"
import { editBoletoInstallment, InstallmentEditError } from "./edit"

const p = prisma as unknown as {
  boletoInstallment: Record<"findFirst" | "findMany" | "update", ReturnType<typeof vi.fn>>
  enrollment: { update: ReturnType<typeof vi.fn> }
}
const fn = (f: unknown) => f as ReturnType<typeof vi.fn>

const NOW = new Date("2026-10-28T15:00:00Z")

function row(over: Record<string, unknown> = {}) {
  return {
    id: "inst1",
    enrollmentId: "enr1",
    number: 2,
    amount: 100,
    dueDate: new Date("2026-11-10T12:00:00Z"),
    status: "GENERATED",
    gateway: "ASAAS",
    asaasPaymentId: "pay_1",
    mpPaymentId: null,
    invoiceUrl: "old.pdf",
    updatedAt: new Date(),
    enrollment: { status: "ACTIVE", tenantId: "t1", flexInstallments: false, installmentMethod: null, asaasSubscriptionId: null, mpSubscriptionId: null },
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // O update devolve a linha encontrada com os campos novos, como o Prisma.
  p.boletoInstallment.update.mockImplementation(async ({ data }) => ({
    ...(await p.boletoInstallment.findFirst.mock.results[0]?.value),
    ...data,
  }))
  p.boletoInstallment.findMany.mockResolvedValue([{ amount: 150 }, { amount: 100 }])
})

describe("editBoletoInstallment", () => {
  it("parcela PAGA não é alterada nem consulta o gateway", async () => {
    p.boletoInstallment.findFirst.mockResolvedValue(row({ status: "PAID" }))
    await expect(
      editBoletoInstallment({ enrollmentId: "enr1", installmentId: "inst1", amount: 50, now: NOW }),
    ).rejects.toBeInstanceOf(InstallmentEditError)
    expect(asaas.updatePayment).not.toHaveBeenCalled()
    expect(p.boletoInstallment.update).not.toHaveBeenCalled()
  })

  it("Asaas: paga lá (webhook perdido) é recusada sem reprecificar", async () => {
    p.boletoInstallment.findFirst.mockResolvedValue(row())
    fn(asaas.getPayment).mockResolvedValue({ status: "RECEIVED" })
    await expect(
      editBoletoInstallment({ enrollmentId: "enr1", installmentId: "inst1", amount: 50, now: NOW }),
    ).rejects.toThrow(/já foi paga/)
    expect(asaas.updatePayment).not.toHaveBeenCalled()
  })

  it("Asaas: vencida ganha valor e vencimento novos no gateway, sai do atraso e reativa", async () => {
    p.boletoInstallment.findFirst.mockResolvedValue(
      row({ status: "OVERDUE", dueDate: new Date("2026-10-10T12:00:00Z") }),
    )
    fn(asaas.getPayment).mockResolvedValue({ status: "OVERDUE" })
    fn(asaas.updatePayment).mockResolvedValue({ value: 150, bankSlipUrl: "new.pdf" })

    const res = await editBoletoInstallment({
      enrollmentId: "enr1",
      installmentId: "inst1",
      amount: 150,
      dueDate: "2026-11-05",
      now: NOW,
    })

    expect(asaas.updatePayment).toHaveBeenCalledWith(
      "pay_1",
      { billingType: "BOLETO", value: 150, dueDate: "2026-11-05" },
      "k",
    )
    const data = p.boletoInstallment.update.mock.calls[0][0].data
    expect(data.status).toBe("GENERATED")
    expect(data.invoiceUrl).toBe("new.pdf")
    expect(p.enrollment.update).toHaveBeenCalledWith({
      where: { id: "enr1" },
      data: { finalAmount: 250 },
    })
    expect(maybeReactivate).toHaveBeenCalledWith("enr1")
    expect(res.after.amount).toBe(150)
  })

  it("vencida sem vencimento novo é recusada (boleto não nasce vencido)", async () => {
    p.boletoInstallment.findFirst.mockResolvedValue(
      row({ status: "OVERDUE", dueDate: new Date("2026-10-10T12:00:00Z") }),
    )
    await expect(
      editBoletoInstallment({ enrollmentId: "enr1", installmentId: "inst1", amount: 150, now: NOW }),
    ).rejects.toThrow(/novo vencimento/)
    expect(asaas.updatePayment).not.toHaveBeenCalled()
  })

  it("MP: cancela o boleto antigo ANTES de voltar a parcela e emitir o novo", async () => {
    p.boletoInstallment.findFirst.mockResolvedValue(
      row({ gateway: "MP", asaasPaymentId: null, mpPaymentId: "999", number: 1 }),
    )
    fn(mp.getPayment).mockResolvedValue({ status: "pending" })
    fn(generateMpBoletoForInstallment).mockResolvedValue(row({ gateway: "MP", amount: 80 }))

    await editBoletoInstallment({ enrollmentId: "enr1", installmentId: "inst1", amount: 80, now: NOW })

    expect(mp.cancelPayment).toHaveBeenCalledWith("t", "999")
    const data = p.boletoInstallment.update.mock.calls[0][0].data
    expect(data).toMatchObject({ status: "SCHEDULED", mpPaymentId: null, amount: 80 })
    expect(fn(mp.cancelPayment).mock.invocationCallOrder[0]).toBeLessThan(
      p.boletoInstallment.update.mock.invocationCallOrder[0],
    )
    // 1ª parcela: sempre na janela, sai boleto novo na hora.
    expect(generateMpBoletoForInstallment).toHaveBeenCalledWith("inst1")
  })

  it("MP: boleto já aprovado lá é recusado sem cancelar", async () => {
    p.boletoInstallment.findFirst.mockResolvedValue(
      row({ gateway: "MP", asaasPaymentId: null, mpPaymentId: "999" }),
    )
    fn(mp.getPayment).mockResolvedValue({ status: "approved" })
    await expect(
      editBoletoInstallment({ enrollmentId: "enr1", installmentId: "inst1", amount: 80, now: NOW }),
    ).rejects.toThrow(/já foi paga/)
    expect(mp.cancelPayment).not.toHaveBeenCalled()
  })

  it("flex no cartão com assinatura: 409 CARD_PLAN_NOT_EDITABLE, nada muda", async () => {
    p.boletoInstallment.findFirst.mockResolvedValue(
      row({ enrollment: { status: "ACTIVE", tenantId: "t1", flexInstallments: true, installmentMethod: "CREDIT_CARD", asaasSubscriptionId: "sub_1", mpSubscriptionId: null } }),
    )
    await expect(
      editBoletoInstallment({ enrollmentId: "enr1", installmentId: "inst1", amount: 50, now: NOW }),
    ).rejects.toMatchObject({ status: 409, code: "CARD_PLAN_NOT_EDITABLE", message: "Plano no cartão: o valor é fixo na assinatura." })
    expect(asaas.updatePayment).not.toHaveBeenCalled()
    expect(p.boletoInstallment.update).not.toHaveBeenCalled()
  })

  it("flex PIX: edita no Asaas mantendo billingType PIX", async () => {
    p.boletoInstallment.findFirst.mockResolvedValue(
      row({ method: "PIX", enrollment: { status: "ACTIVE", tenantId: "t1", flexInstallments: true, installmentMethod: "PIX", asaasSubscriptionId: null, mpSubscriptionId: null } }),
    )
    fn(asaas.getPayment).mockResolvedValue({ status: "PENDING" })
    fn(asaas.updatePayment).mockResolvedValue({})
    await editBoletoInstallment({ enrollmentId: "enr1", installmentId: "inst1", amount: 50, now: NOW })
    expect(asaas.updatePayment).toHaveBeenCalledWith("pay_1", expect.objectContaining({ billingType: "PIX", value: 50 }), "k")
  })

  it("flex MP: volta a SCHEDULED e NÃO reemite pelo emissor legado de boleto", async () => {
    p.boletoInstallment.findFirst.mockResolvedValue(
      row({ gateway: "MP", asaasPaymentId: null, mpPaymentId: "999", number: 1, method: "PIX", enrollment: { status: "ACTIVE", tenantId: "t1", flexInstallments: true, installmentMethod: "PIX", asaasSubscriptionId: null, mpSubscriptionId: null } }),
    )
    fn(mp.getPayment).mockResolvedValue({ status: "pending" })
    await editBoletoInstallment({ enrollmentId: "enr1", installmentId: "inst1", amount: 80, now: NOW })
    expect(mp.cancelPayment).toHaveBeenCalledWith("t", "999")
    expect(generateMpBoletoForInstallment).not.toHaveBeenCalled()
  })

  it("flex Asaas sem cobrança emitida: edita só a linha, sem gateway, e sai do atraso (I1)", async () => {
    p.boletoInstallment.findFirst.mockResolvedValue(
      row({ status: "OVERDUE", asaasPaymentId: null, method: null, dueDate: new Date("2026-10-20T12:00:00Z"), enrollment: { status: "ACTIVE", tenantId: "t1", flexInstallments: true, installmentMethod: null, asaasSubscriptionId: null, mpSubscriptionId: null } }),
    )
    const res = await editBoletoInstallment({ enrollmentId: "enr1", installmentId: "inst1", amount: 70, dueDate: "2026-11-15", now: NOW })
    expect(asaas.getPayment).not.toHaveBeenCalled()
    expect(asaas.updatePayment).not.toHaveBeenCalled()
    expect(p.boletoInstallment.update).toHaveBeenCalledWith({
      where: { id: "inst1" },
      data: { amount: 70, dueDate: new Date("2026-11-15T12:00:00Z"), status: "SCHEDULED" },
    })
    expect(res.after).toMatchObject({ amount: 70, dueDate: "2026-11-15", status: "SCHEDULED" })
    expect(maybeReactivate).toHaveBeenCalledWith("enr1")
  })

  it("flex Asaas no boleto com cobrança: preserva billingType BOLETO", async () => {
    p.boletoInstallment.findFirst.mockResolvedValue(
      row({ method: "BOLETO", enrollment: { status: "ACTIVE", tenantId: "t1", flexInstallments: true, installmentMethod: "BOLETO", asaasSubscriptionId: null, mpSubscriptionId: null } }),
    )
    fn(asaas.getPayment).mockResolvedValue({ status: "PENDING" })
    fn(asaas.updatePayment).mockResolvedValue({})
    await editBoletoInstallment({ enrollmentId: "enr1", installmentId: "inst1", amount: 50, now: NOW })
    expect(asaas.updatePayment).toHaveBeenCalledWith("pay_1", expect.objectContaining({ billingType: "BOLETO" }), "k")
  })
})
