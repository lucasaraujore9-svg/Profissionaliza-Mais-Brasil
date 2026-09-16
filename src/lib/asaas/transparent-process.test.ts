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
    deletePayment: vi.fn(),
    cancelSubscription: vi.fn(),
    createInstallmentWithCreditCard: vi.fn(),
    getInstallmentPayments: vi.fn(),
    deleteInstallment: vi.fn(),
  }
})

const lock = vi.hoisted(() => ({ acquired: true }))
vi.mock("@/lib/enrollment/fulfill", () => ({
  advisoryLockKeyFrom: () => BigInt(1),
  withAdvisoryLock: vi.fn(async (_key: bigint, fn: () => Promise<void>) => {
    if (!lock.acquired) return false
    await fn()
    return true
  }),
}))

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

import { prisma } from "@/lib/prisma"
import {
  cancelSubscription,
  createInstallmentWithCreditCard,
  deleteInstallment,
  getInstallmentPayments,
  createPayment,
  createSubscription,
  deletePayment,
  getBillingInfo,
  getCustomer,
  getPayment,
  getPixQrCode,
  listPayments,
  payWithCreditCard,
} from "./client"
import { fulfillFromAsaasPayment } from "./fulfillment"
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
  asaasPaymentId: null,
  asaasSubscriptionId: null,
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
  interestFreeInstallments: 1,
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
    deleted: false,
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
  lock.acquired = true
  getPaymentMock.mockResolvedValue(payment())
})

describe("checkout transparente de parcela Asaas existente", () => {
  it("PIX reutiliza o paymentId da parcela sem criar cobrança", async () => {
    getPixQrCodeMock.mockResolvedValue({
      success: true,
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
    asaasPaymentId: null,
    asaasSubscriptionId: null,
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

// ── Retomada: a página de pagamento é o ÚNICO link que o aluno recebe ────────
// Cada volta a ela não pode deixar outra cobrança viva para a mesma compra.

const PIX_QR = {
  success: true,
  payload: "pix-copia-e-cola",
  encodedImage: "base64",
  expirationDate: "2026-09-20",
  description: "Curso",
}

function avulsa(overrides: Partial<AsaasTransparentEnrollment> = {}): AsaasTransparentEnrollment {
  return {
    ...enrollment,
    id: "enr_av",
    paymentType: "ONE_TIME",
    installmentsTotal: null,
    externalReference: "enr_av",
    asaasPaymentId: "pay_old",
    asaasSubscriptionId: null,
    ...overrides,
  }
}

function anterior(billingType: string, status = "PENDING", deleted = false) {
  return { ...payment(status), id: "pay_old", installment: null, billingType, deleted }
}

describe("retomada da cobrança avulsa na página de pagamento", () => {
  beforeEach(() => {
    vi.mocked(findOrCreateAsaasCustomer).mockResolvedValue({
      customer: { id: "cus_1" },
      created: false,
    } as unknown as Awaited<ReturnType<typeof findOrCreateAsaasCustomer>>)
    vi.mocked(getCustomer).mockResolvedValue({ id: "cus_1", deleted: false } as never)
    createPaymentMock.mockResolvedValue({ ...payment(), id: "pay_new", billingType: "BOLETO" } as never)
  })

  it("mesmo método ainda em aberto: reusa a cobrança, sem criar outra", async () => {
    getPaymentMock.mockResolvedValue(anterior("PIX") as never)
    getPixQrCodeMock.mockResolvedValue(PIX_QR)

    const result = await processTransparentAsaasPayment(avulsa(), { method: "PIX" }, ctx)

    expect(result).toMatchObject({ kind: "pending", pix: { qrCode: "pix-copia-e-cola" } })
    expect(getPixQrCodeMock).toHaveBeenCalledWith("pay_old", "asaas_key")
    expect(createPaymentMock).not.toHaveBeenCalled()
    expect(vi.mocked(deletePayment)).not.toHaveBeenCalled()
  })

  it("troca de método: remove a anterior e só cria a nova depois de o Asaas confirmar", async () => {
    getPaymentMock
      .mockResolvedValueOnce(anterior("PIX") as never)
      .mockResolvedValueOnce(anterior("PIX", "PENDING", true) as never)
    vi.mocked(deletePayment).mockResolvedValue({ deleted: true, id: "pay_old" })
    getBillingInfoMock.mockResolvedValue({
      pix: null,
      creditCard: null,
      bankSlip: {
        identificationField: "00190",
        nossoNumero: "1",
        barCode: "0019",
        bankSlipUrl: "https://asaas.test/boleto/pay_new",
        daysAfterDueDateToRegistrationCancellation: 30,
      },
    })

    const result = await processTransparentAsaasPayment(avulsa(), { method: "BOLETO" }, ctx)

    expect(vi.mocked(deletePayment)).toHaveBeenCalledWith("pay_old", "asaas_key")
    expect(vi.mocked(deletePayment).mock.invocationCallOrder[0]).toBeLessThan(
      createPaymentMock.mock.invocationCallOrder[0],
    )
    expect(result).toMatchObject({
      kind: "pending",
      boleto: { url: "https://asaas.test/boleto/pay_new" },
    })
  })

  it("remoção não confirmada (DELETE é soft): não cria segunda cobrança", async () => {
    getPaymentMock.mockResolvedValue(anterior("PIX") as never)
    vi.mocked(deletePayment).mockResolvedValue({ deleted: true, id: "pay_old" })

    const result = await processTransparentAsaasPayment(avulsa(), { method: "BOLETO" }, ctx)

    expect(result).toMatchObject({ kind: "error", code: "PREVIOUS_CHARGE_OPEN" })
    expect(createPaymentMock).not.toHaveBeenCalled()
  })

  it("anterior já paga (webhook atrasado): efetiva e não cobra de novo", async () => {
    getPaymentMock.mockResolvedValue(anterior("PIX", "RECEIVED") as never)

    const result = await processTransparentAsaasPayment(avulsa(), { method: "BOLETO" }, ctx)

    expect(result).toEqual({ kind: "approved", status: "RECEIVED" })
    expect(vi.mocked(fulfillFromAsaasPayment)).toHaveBeenCalled()
    expect(createPaymentMock).not.toHaveBeenCalled()
    expect(vi.mocked(deletePayment)).not.toHaveBeenCalled()
  })

  it("anterior em análise de risco: aguarda, sem cobrar por cima", async () => {
    getPaymentMock.mockResolvedValue(anterior("CREDIT_CARD", "AWAITING_RISK_ANALYSIS") as never)

    const result = await processTransparentAsaasPayment(avulsa(), { method: "PIX" }, ctx)

    expect(result).toEqual({ kind: "pending" })
    expect(createPaymentMock).not.toHaveBeenCalled()
  })

  it("outra requisição já processando esta compra: não cobra", async () => {
    lock.acquired = false

    const result = await processTransparentAsaasPayment(avulsa(), { method: "PIX" }, ctx)

    expect(result).toMatchObject({ kind: "error", code: "PAYMENT_IN_PROGRESS" })
    expect(getPaymentMock).not.toHaveBeenCalled()
    expect(createPaymentMock).not.toHaveBeenCalled()
  })
})

describe("nunca devolve a fatura hospedada do Asaas", () => {
  beforeEach(() => {
    vi.mocked(findOrCreateAsaasCustomer).mockResolvedValue({
      customer: { id: "cus_1" },
      created: false,
    } as unknown as Awaited<ReturnType<typeof findOrCreateAsaasCustomer>>)
  })

  it("PIX sem QR vira erro, não o link da fatura", async () => {
    createPaymentMock.mockResolvedValue({ ...payment(), id: "pay_new", billingType: "PIX" } as never)
    getPixQrCodeMock.mockResolvedValue(null as never)

    const result = await processTransparentAsaasPayment(
      avulsa({ asaasPaymentId: null }),
      { method: "PIX" },
      ctx,
    )

    expect(result).toMatchObject({ kind: "error", code: "PIX_UNAVAILABLE" })
    expect(JSON.stringify(result)).not.toContain("invoice")
  })

  it("boleto sem PDF vira erro, não o link da fatura", async () => {
    createPaymentMock.mockResolvedValue({
      ...payment(),
      id: "pay_new",
      bankSlipUrl: null,
    } as never)
    getBillingInfoMock.mockResolvedValue(null as never)

    const result = await processTransparentAsaasPayment(
      avulsa({ asaasPaymentId: null }),
      { method: "BOLETO" },
      ctx,
    )

    expect(result).toMatchObject({ kind: "error", code: "BOLETO_UNAVAILABLE" })
  })
})

describe("retomada da mensal no cartão", () => {
  const card = {
    method: "CREDIT_CARD" as const,
    card: {
      holderName: "ALUNO",
      number: "4111111111111111",
      expiryMonth: "12",
      expiryYear: "28",
      ccv: "123",
    },
    postalCode: "01001000",
    addressNumber: "1",
  }

  beforeEach(() => {
    vi.mocked(findOrCreateAsaasCustomer).mockResolvedValue({
      customer: { id: "cus_1" },
      created: false,
    } as unknown as Awaited<ReturnType<typeof findOrCreateAsaasCustomer>>)
  })

  it("assinatura anterior não capturada: remove antes de criar outra", async () => {
    vi.mocked(listPayments)
      .mockResolvedValueOnce({ data: [anterior("CREDIT_CARD", "PENDING")] } as never)
      .mockResolvedValue({ data: [] } as never)
    vi.mocked(cancelSubscription).mockResolvedValue({ deleted: true, id: "sub_old" })
    vi.mocked(createSubscription).mockResolvedValue({ id: "sub_new" } as never)

    await processTransparentAsaasPayment(
      avulsa({ paymentType: "MONTHLY", asaasPaymentId: null, asaasSubscriptionId: "sub_old" }),
      card,
      ctx,
    )

    expect(vi.mocked(cancelSubscription)).toHaveBeenCalledWith("sub_old", "asaas_key")
    expect(vi.mocked(cancelSubscription).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(createSubscription).mock.invocationCallOrder[0],
    )
  }, 10_000)

  it("remoção da assinatura anterior falhou: não cria segunda recorrência", async () => {
    vi.mocked(listPayments).mockResolvedValue({ data: [] } as never)
    vi.mocked(cancelSubscription).mockRejectedValue(new Error("500"))

    const result = await processTransparentAsaasPayment(
      avulsa({ paymentType: "MONTHLY", asaasPaymentId: null, asaasSubscriptionId: "sub_old" }),
      card,
      ctx,
    )

    expect(result).toMatchObject({ kind: "error", code: "PREVIOUS_CHARGE_OPEN" })
    expect(vi.mocked(createSubscription)).not.toHaveBeenCalled()
  })
})

// ── Parcelamento no cartão na conta da unidade ────────────────────────────────
// No Asaas toda parcela é sem juros para o aluno: o teto é o nº que a unidade
// configurou, o mesmo que a vitrine anuncia.

describe("parcelamento no cartão (Asaas da unidade)", () => {
  const CARD = {
    holderName: "ALUNO TESTE",
    number: "4111111111111111",
    expiryMonth: "12",
    expiryYear: "28",
    ccv: "123",
  }
  const createInstallmentMock = vi.mocked(createInstallmentWithCreditCard)
  const installmentPaymentsMock = vi.mocked(getInstallmentPayments)
  const updateMock = vi.mocked(prisma.enrollment.update)
  const ctx10: AsaasTransparentCtx = { ...ctx, interestFreeInstallments: 10 }

  function parcela(n: number, status = "CONFIRMED") {
    return {
      ...payment(status),
      id: `pay_p${n}`,
      installment: "ins_1",
      installmentNumber: n,
      billingType: "CREDIT_CARD",
      value: 50,
      dueDate: `2026-${String(9 + n).padStart(2, "0")}-15`,
    }
  }

  beforeEach(() => {
    vi.mocked(findOrCreateAsaasCustomer).mockResolvedValue({
      customer: { id: "cus_1" },
      created: false,
    } as unknown as Awaited<ReturnType<typeof findOrCreateAsaasCustomer>>)
    vi.mocked(getCustomer).mockResolvedValue({ id: "cus_1", deleted: false } as never)
    createInstallmentMock.mockResolvedValue({ id: "ins_1" } as never)
    updateMock.mockResolvedValue({} as never)
    // Fora de ordem de propósito: a 1ª parcela é a de MENOR vencimento.
    installmentPaymentsMock.mockResolvedValue({
      data: [parcela(2), parcela(1)],
    } as never)
  })

  it("cria o parcelamento na conta da unidade e libera pela 1ª parcela", async () => {
    const result = await processTransparentAsaasPayment(
      avulsa({ asaasPaymentId: null, finalAmount: 500 }),
      { method: "CREDIT_CARD", card: CARD, postalCode: "01001000", addressNumber: "10", installments: 10 },
      ctx10,
    )

    expect(result).toEqual({ kind: "approved", status: "CONFIRMED" })
    expect(createInstallmentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        installmentCount: 10,
        value: 50,
        totalValue: 500,
        billingType: "CREDIT_CARD",
        // É por esta referência que o webhook da unidade casa cada parcela.
        paymentExternalReference: "enr_enr_av",
        remoteIp: "203.0.113.10",
      }),
      "asaas_key",
    )
    expect(createPaymentMock).not.toHaveBeenCalled()
    expect(vi.mocked(fulfillFromAsaasPayment)).toHaveBeenCalledWith(
      ctx.fulfillTenant,
      "enr_av",
      expect.objectContaining({ id: "pay_p1" }),
    )
  })

  it("referência da parcela é sempre enr_<id>, mesmo com a da matrícula vazia", async () => {
    // O webhook da unidade só encontra as parcelas 2..N por este prefixo.
    await processTransparentAsaasPayment(
      avulsa({ asaasPaymentId: null, finalAmount: 500, externalReference: "" }),
      { method: "CREDIT_CARD", card: CARD, installments: 10 },
      ctx10,
    )

    expect(createInstallmentMock).toHaveBeenCalledWith(
      expect.objectContaining({ paymentExternalReference: "enr_enr_av" }),
      "asaas_key",
    )
  })

  it("marca a matrícula como parcelada ANTES de chamar o Asaas", async () => {
    // As parcelas podem chegar pelo webhook antes da resposta. Sem
    // `installmentsTotal` gravado, cada uma liberaria o curso de novo.
    await processTransparentAsaasPayment(
      avulsa({ asaasPaymentId: null, finalAmount: 500 }),
      { method: "CREDIT_CARD", card: CARD, installments: 10 },
      ctx10,
    )

    const marca = updateMock.mock.calls.findIndex(
      ([arg]) => (arg as { data: { paymentType?: string } }).data.paymentType === "CARD_INSTALLMENT",
    )
    expect(marca).toBeGreaterThanOrEqual(0)
    expect(updateMock.mock.calls[marca]![0]).toMatchObject({
      data: { paymentType: "CARD_INSTALLMENT", installmentsTotal: 10 },
    })
    expect(updateMock.mock.invocationCallOrder[marca]).toBeLessThan(
      createInstallmentMock.mock.invocationCallOrder[0]!,
    )
    // E guarda a 1ª parcela (menor vencimento) + o parcelamento.
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ asaasInstallmentId: "ins_1", asaasPaymentId: "pay_p1" }),
      }),
    )
  })

  it("acima do nº configurado pela unidade: recusa sem tocar em cobrança nenhuma", async () => {
    const result = await processTransparentAsaasPayment(
      avulsa({ finalAmount: 500 }),
      { method: "CREDIT_CARD", card: CARD, installments: 12 },
      ctx10,
    )

    expect(result).toMatchObject({ kind: "error", httpStatus: 400, code: "INSTALLMENTS_NOT_ALLOWED" })
    expect(createInstallmentMock).not.toHaveBeenCalled()
    // Validado antes da retomada: o PIX em aberto do aluno não foi removido.
    expect(getPaymentMock).not.toHaveBeenCalled()
    expect(vi.mocked(deletePayment)).not.toHaveBeenCalled()
  })

  it("respeita a parcela mínima de R$ 5 do Asaas", async () => {
    // R$ 19,90 com até 10x configurado cabe em 3x — 4x daria R$ 4,97.
    const result = await processTransparentAsaasPayment(
      avulsa({ asaasPaymentId: null, finalAmount: 19.9 }),
      { method: "CREDIT_CARD", card: CARD, installments: 4 },
      ctx10,
    )

    expect(result).toMatchObject({ kind: "error", code: "INSTALLMENTS_NOT_ALLOWED" })
    expect(createInstallmentMock).not.toHaveBeenCalled()
  })

  it("unidade que só vende à vista: parcelas recusadas", async () => {
    const result = await processTransparentAsaasPayment(
      avulsa({ asaasPaymentId: null, finalAmount: 500 }),
      { method: "CREDIT_CARD", card: CARD, installments: 2 },
      ctx,
    )

    expect(result).toMatchObject({ kind: "error", code: "INSTALLMENTS_NOT_ALLOWED" })
  })

  it("cartão recusado (4xx): a matrícula volta a ser à vista", async () => {
    const { AsaasApiError } = await import("./client")
    createInstallmentMock.mockRejectedValue(
      new (AsaasApiError as unknown as new (m: string, c: number) => Error)("recusado", 400),
    )

    const result = await processTransparentAsaasPayment(
      avulsa({ asaasPaymentId: null, finalAmount: 500 }),
      { method: "CREDIT_CARD", card: CARD, installments: 5 },
      ctx10,
    )

    expect(result).toMatchObject({ kind: "error", code: "PAYMENT_REJECTED" })
    expect(updateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { paymentType: "ONE_TIME", installmentsTotal: null } }),
    )
  })

  it("falha do Asaas (5xx): NÃO desfaz — o parcelamento pode ter sido criado", async () => {
    // Marcadas como à vista, as N parcelas liberariam o curso N vezes.
    const { AsaasApiError } = await import("./client")
    createInstallmentMock.mockRejectedValue(
      new (AsaasApiError as unknown as new (m: string, c: number) => Error)("timeout", 502),
    )

    await expect(
      processTransparentAsaasPayment(
        avulsa({ asaasPaymentId: null, finalAmount: 500 }),
        { method: "CREDIT_CARD", card: CARD, installments: 5 },
        ctx10,
      ),
    ).rejects.toThrow()
    expect(updateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { paymentType: "ONE_TIME", installmentsTotal: null } }),
    )
  })

  it("parcelamento anterior não capturado + nova tentativa no PIX: remove o parcelamento inteiro e volta a ser à vista", async () => {
    getPaymentMock
      .mockResolvedValueOnce({ ...parcela(1, "PENDING"), id: "pay_old" } as never)
      .mockResolvedValueOnce({ ...parcela(1, "PENDING"), id: "pay_old", deleted: true } as never)
    vi.mocked(deleteInstallment).mockResolvedValue({ deleted: true, id: "ins_1" })
    createPaymentMock.mockResolvedValue({ ...payment(), id: "pay_pix", billingType: "PIX" } as never)
    getPixQrCodeMock.mockResolvedValue(PIX_QR)

    await processTransparentAsaasPayment(
      avulsa({ paymentType: "CARD_INSTALLMENT", installmentsTotal: 5 }),
      { method: "PIX" },
      ctx10,
    )

    // Apagar só a 1ª cobrança deixaria as outras parcelas vivas no cartão.
    expect(vi.mocked(deleteInstallment)).toHaveBeenCalledWith("ins_1", "asaas_key")
    expect(vi.mocked(deletePayment)).not.toHaveBeenCalled()
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: { paymentType: "ONE_TIME", installmentsTotal: null } }),
    )
    expect(createPaymentMock).toHaveBeenCalled()
  })
})
