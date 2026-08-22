import type { BoletoInstallment } from "@prisma/client"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    enrollment: {
      update: vi.fn(),
      // Lido por `asaasSplitsForEnrollment` para descobrir se a cobranca leva
      // rateio. Sem snapshot = venda comum, sem split.
      findUnique: vi.fn().mockResolvedValue({ authorSplitSnapshot: null }),
    },
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
import { findOrCreateAsaasCustomer } from "./client"
import { resolvePayer, type PayerSource } from "@/lib/checkout/payer"
import {
  processExistingAsaasInstallmentPayment,
  processTransparentAsaasPayment,
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
  payerNome: "Aluno",
  payerEmail: "aluno@example.com",
  payerCpf: "11144477735",
  payerFone: "11999999999",
  payerAsaasCustomerId: "cus_1",
  payerExternalReference: "student_enr_enr_1",
  payerKind: "STUDENT",
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

// ── Responsavel financeiro: a cobranca sai no CPF DELE ─────────────────────
// Este e o teste que prende a correcao do bug de negocio. Se ele passar a
// mandar o CPF do aluno menor, a venda volta a exigir que a mae seja cadastrada
// como se fosse a aluna — e o certificado volta a sair no nome errado.

const CPF_ALUNO = "52998224725"
const CPF_RESP = "39053344705"

const alunoMenor: PayerSource = {
  id: "stu_1",
  nome: "João Pedro da Silva",
  email: "joao@exemplo.com",
  cpf: CPF_ALUNO,
  fone: "31988887777",
  responsavel: "Maria da Silva",
  cpfResponsavel: CPF_RESP,
  responsavelEmail: "maria@exemplo.com",
  responsavelFone: "31999998888",
  asaasCustomerId: null,
  responsavelAsaasCustomerId: null,
}

function enrollmentDe(payerSource: PayerSource): AsaasTransparentEnrollment {
  const payer = resolvePayer(payerSource)
  return {
    id: "enr_9",
    finalAmount: 300,
    paymentType: "ONE_TIME",
    installmentsTotal: null,
    externalReference: "enr_9",
    courseNome: "Auxiliar Administrativo",
    payerNome: payer.nome,
    payerEmail: payer.email,
    payerCpf: payer.cpf,
    payerFone: payer.fone,
    payerAsaasCustomerId: payer.asaasCustomerId,
    payerExternalReference: payer.asaasExternalReference,
    payerKind: payer.kind,
    asaasCustomerId: null,
  }
}

describe("responsável financeiro (aluno menor)", () => {
  beforeEach(() => {
    vi.mocked(findOrCreateAsaasCustomer).mockResolvedValue({
      customer: { id: "cus_mae" },
      created: true,
    } as unknown as Awaited<ReturnType<typeof findOrCreateAsaasCustomer>>)
    createPaymentMock.mockResolvedValue({
      id: "pay_9",
      status: "PENDING",
    } as never)
  })

  it("cria o customer Asaas no CPF do RESPONSÁVEL, não no do aluno", async () => {
    await processTransparentAsaasPayment(
      enrollmentDe(alunoMenor),
      { method: "PIX" },
      ctx,
    )

    const arg = vi.mocked(findOrCreateAsaasCustomer).mock.calls[0]![0]
    expect(arg.cpfCnpj).toBe(CPF_RESP)
    expect(arg.cpfCnpj).not.toBe(CPF_ALUNO)
    expect(arg.name).toBe("Maria da Silva")
    expect(arg.email).toBe("maria@exemplo.com")
  })

  it("sem responsável, segue cobrando no CPF do próprio aluno", async () => {
    await processTransparentAsaasPayment(
      enrollmentDe({
        ...alunoMenor,
        responsavel: null,
        cpfResponsavel: null,
      }),
      { method: "PIX" },
      ctx,
    )

    const arg = vi.mocked(findOrCreateAsaasCustomer).mock.calls[0]![0]
    expect(arg.cpfCnpj).toBe(CPF_ALUNO)
  })

  it("o holder do cartão também é o responsável", async () => {
    await processTransparentAsaasPayment(
      enrollmentDe(alunoMenor),
      {
        method: "CREDIT_CARD",
        card: {
          holderName: "MARIA DA SILVA",
          number: "4111111111111111",
          expiryMonth: "12",
          expiryYear: "28",
          ccv: "123",
        },
        postalCode: "01001000",
        addressNumber: "100",
      },
      ctx,
    )

    const holder = createPaymentMock.mock.calls[0]![0].creditCardHolderInfo
    expect(holder?.cpfCnpj).toBe(CPF_RESP)
    expect(holder?.phone).toBe("31999998888")
  })
})
