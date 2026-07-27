import type { BoletoInstallment } from "@prisma/client"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    enrollment: { update: vi.fn() },
  },
}))

vi.mock("./client", () => {
  class AsaasApiError extends Error {
    statusCode: number
    errors?: Array<{ description: string }>

    constructor(message: string, statusCode = 400) {
      super(message)
      this.statusCode = statusCode
    }
  }
  return {
    AsaasApiError,
    findOrCreateAsaasCustomer: vi.fn(),
    getCustomer: vi.fn(),
    createPayment: vi.fn(),
    createSubscription: vi.fn(),
    getPixQrCode: vi.fn(),
    getBillingInfo: vi.fn(),
    getPayment: vi.fn(),
    payWithCreditCard: vi.fn(),
    listPayments: vi.fn(),
  }
})

vi.mock("./fulfillment", () => ({
  fulfillFromAsaasPayment: vi.fn(),
}))

vi.mock("@/lib/checkout/free-enrollment", () => ({
  isFreeAmount: vi.fn(() => false),
  releaseFreeEnrollment: vi.fn(),
}))

vi.mock("@/lib/installments/settle", () => ({
  settleBoletoInstallment: vi.fn(),
}))

import {
  createPayment,
  getBillingInfo,
  getPayment,
  getPixQrCode,
  payWithCreditCard,
} from "./client"
import { settleBoletoInstallment } from "@/lib/installments/settle"
import {
  processExistingAsaasInstallmentPayment,
  type AsaasTransparentCtx,
  type AsaasTransparentEnrollment,
} from "./transparent-process"

const getPaymentMock = vi.mocked(getPayment)
const getPixQrCodeMock = vi.mocked(getPixQrCode)
const getBillingInfoMock = vi.mocked(getBillingInfo)
const payWithCreditCardMock = vi.mocked(payWithCreditCard)
const createPaymentMock = vi.mocked(createPayment)
const settleMock = vi.mocked(settleBoletoInstallment)

const installment = {
  id: "inst_1",
  enrollmentId: "enr_1",
  tenantId: "tenant_1",
  number: 1,
  amount: 100,
  dueDate: new Date("2026-07-30T12:00:00Z"),
  status: "GENERATED",
  gateway: "ASAAS",
  invoiceUrl: "https://asaas.test/boleto/pay_1",
  digitableLine: null,
  generatedAt: new Date(),
  mpPaymentId: null,
  asaasPaymentId: "pay_1",
  paidAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as BoletoInstallment

const enrollment: AsaasTransparentEnrollment = {
  id: "enr_1",
  finalAmount: 300,
  paymentType: "BOLETO_INSTALLMENT",
  installmentsTotal: 3,
  externalReference: "carne_enr_1",
  courseNome: "Combo educação",
  studentNome: "Aluno",
  studentEmail: "aluno@example.com",
  studentCpf: "11144477735",
  studentFone: "11999999999",
  asaasCustomerId: "cus_1",
}

const ctx: AsaasTransparentCtx = {
  apiKey: "asaas_key",
  fulfillTenant: {
    id: "tenant_1",
    slug: "ceipro",
    name: "CEIPRO",
    plataformaVendedorId: "seller_1",
  },
  notificationUrl: "https://example.com/webhook",
  remoteIp: "203.0.113.10",
}

function payment(status = "PENDING") {
  return {
    id: "pay_1",
    customer: "cus_1",
    subscription: null,
    installment: "carne_1",
    billingType: "BOLETO",
    value: 100,
    netValue: 98,
    status,
    dueDate: "2026-07-30",
    paymentDate: status === "CONFIRMED" ? "2026-07-27" : null,
    clientPaymentDate: null,
    invoiceUrl: "https://asaas.test/invoice/pay_1",
    bankSlipUrl: "https://asaas.test/boleto/pay_1",
    transactionReceiptUrl: null,
    externalReference: "carne_enr_1",
    description: "Combo educação — parcela 1",
    dateCreated: "2026-07-27",
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  getPaymentMock.mockResolvedValue(payment())
})

describe("checkout transparente de parcela Asaas existente", () => {
  it("PIX reutiliza o paymentId da parcela sem criar cobrança", async () => {
    getPixQrCodeMock.mockResolvedValue({
      payload: "pix-copia-e-cola",
      encodedImage: "base64",
      expirationDate: "2026-07-30",
      description: "Parcela 1",
    })

    const result = await processExistingAsaasInstallmentPayment(
      installment,
      enrollment,
      { method: "PIX" },
      ctx,
    )

    expect(result).toMatchObject({
      kind: "pending",
      pix: { qrCode: "pix-copia-e-cola" },
    })
    expect(getPixQrCodeMock).toHaveBeenCalledWith("pay_1", "asaas_key")
    expect(createPaymentMock).not.toHaveBeenCalled()
  })

  it("boleto devolve a cobrança já emitida da parcela", async () => {
    getBillingInfoMock.mockResolvedValue({
      pix: null,
      creditCard: null,
      bankSlip: {
        identificationField: "00190.00009 00000.000000",
        nossoNumero: "123",
        barCode: "0019",
        bankSlipUrl: "https://asaas.test/boleto/pay_1",
        daysAfterDueDateToRegistrationCancellation: 30,
      },
    })

    const result = await processExistingAsaasInstallmentPayment(
      installment,
      enrollment,
      { method: "BOLETO" },
      ctx,
    )

    expect(result).toMatchObject({
      kind: "pending",
      boleto: {
        url: "https://asaas.test/boleto/pay_1",
        digitableLine: "00190.00009 00000.000000",
      },
    })
    expect(createPaymentMock).not.toHaveBeenCalled()
  })

  it("cartão paga a mesma cobrança e liquida somente a parcela", async () => {
    payWithCreditCardMock.mockResolvedValue(payment("CONFIRMED"))

    const result = await processExistingAsaasInstallmentPayment(
      installment,
      enrollment,
      {
        method: "CREDIT_CARD",
        card: {
          holderName: "ALUNO TESTE",
          number: "4111111111111111",
          expiryMonth: "12",
          expiryYear: "28",
          ccv: "123",
        },
        postalCode: "01001000",
        addressNumber: "100",
        phone: "11999999999",
      },
      ctx,
    )

    expect(result).toEqual({ kind: "approved", status: "CONFIRMED" })
    expect(payWithCreditCardMock).toHaveBeenCalledWith(
      "pay_1",
      expect.objectContaining({ remoteIp: "203.0.113.10" }),
      "asaas_key",
    )
    expect(settleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        installment,
        event: expect.objectContaining({
          externalPaymentId: "pay_1",
          amount: 100,
        }),
      }),
    )
    expect(createPaymentMock).not.toHaveBeenCalled()
  })

  it("não tenta cobrar o cartão novamente enquanto a parcela está em análise", async () => {
    getPaymentMock.mockResolvedValue(payment("AWAITING_RISK_ANALYSIS"))

    const result = await processExistingAsaasInstallmentPayment(
      installment,
      enrollment,
      {
        method: "CREDIT_CARD",
        card: {
          holderName: "ALUNO TESTE",
          number: "4111111111111111",
          expiryMonth: "12",
          expiryYear: "28",
          ccv: "123",
        },
        postalCode: "01001000",
        addressNumber: "100",
        phone: "11999999999",
      },
      ctx,
    )

    expect(result).toEqual({ kind: "pending" })
    expect(payWithCreditCardMock).not.toHaveBeenCalled()
    expect(createPaymentMock).not.toHaveBeenCalled()
  })
})
