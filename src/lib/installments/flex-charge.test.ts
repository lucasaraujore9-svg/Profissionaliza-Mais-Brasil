import { beforeEach, describe, expect, it, vi } from "vitest"

// Cobrança de UMA linha do parcelado: o invariante é nunca deixar duas
// cobranças vivas para a mesma parcela, e nunca cobrar sem o rateio.

vi.mock("@/lib/prisma", () => ({
  prisma: {
    boletoInstallment: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  },
}))
vi.mock("./plan", () => ({ loadContext: vi.fn(), resolveAsaasCustomerId: vi.fn(async () => "cus_1") }))
vi.mock("@/lib/asaas/client", () => {
  class AsaasApiError extends Error {
    statusCode: number
    constructor(message: string, statusCode = 400) {
      super(message)
      this.statusCode = statusCode
    }
  }
  return {
    AsaasApiError,
    decryptTenantAsaasKey: () => "unit_key",
    motherAsaasKey: () => "mother_key",
    getPayment: vi.fn(),
    createPayment: vi.fn(),
    deletePayment: vi.fn(),
    listPayments: vi.fn(async () => ({ data: [] })),
    payWithCreditCard: vi.fn(),
    getPixQrCode: vi.fn(async () => ({ payload: "pix-copia", encodedImage: "img" })),
    getBillingInfo: vi.fn(async () => ({ bankSlip: { bankSlipUrl: "boleto.pdf", identificationField: "123" } })),
  }
})
vi.mock("@/lib/mercadopago/client", () => ({
  decryptTenantMpToken: () => "mp_token",
  getPayment: vi.fn(),
  createPayment: vi.fn(),
  cancelPayment: vi.fn(),
}))
const lock = vi.hoisted(() => ({ acquired: true }))
vi.mock("@/lib/enrollment/fulfill", () => ({
  advisoryLockKeyFrom: () => BigInt(1),
  withAdvisoryLock: vi.fn(async (_k: bigint, fn: () => Promise<void>) => {
    if (!lock.acquired) return false
    await fn()
    return true
  }),
}))
vi.mock("@/lib/asaas/fulfillment", () => ({ fulfillFromAsaasPayment: vi.fn() }))
vi.mock("@/lib/checkout/free-enrollment", () => ({ isFreeAmount: () => false, releaseFreeEnrollment: vi.fn() }))
vi.mock("./settle", () => ({ settleBoletoInstallment: vi.fn() }))
vi.mock("@/lib/course-authoring/split-server", () => ({ asaasSplitsForEnrollment: vi.fn(async () => undefined) }))
vi.mock("@/lib/subscriptions/carne", () => ({ saveBoletoAddress: vi.fn() }))
vi.mock("@/lib/tenant/urls", () => ({ asaasWebhookUrl: () => "https://x/asaas", mpWebhookUrl: () => "https://x/mp" }))
vi.mock("@/lib/pmb-config", () => ({
  pmbMpAccessToken: async () => "pmb_mp",
  pmbPlataformaPolo: () => "pmb",
  pmbPlataformaVendedorId: () => null,
  PMB_TENANT_SLUG: "__pmb__",
}))

import { prisma } from "@/lib/prisma"
import * as asaas from "@/lib/asaas/client"
import * as mp from "@/lib/mercadopago/client"
import { settleBoletoInstallment } from "./settle"
import { asaasSplitsForEnrollment } from "@/lib/course-authoring/split-server"
import { saveBoletoAddress } from "@/lib/subscriptions/carne"
import { loadContext } from "./plan"
import { chargeFlexRow, type FlexPayer } from "./flex-charge"

const m = <T>(f: T) => f as unknown as ReturnType<typeof vi.fn>
const row = prisma.boletoInstallment as unknown as Record<"findUnique" | "findFirst" | "update", ReturnType<typeof vi.fn>>

const payer: FlexPayer = { nome: "Lorena Silva", email: "l@x.com", cpf: "11418766550" }
const address = { cep: "01001000", rua: "Rua A", numero: "10", bairro: "Centro", cidade: "SP", estado: "SP" }

function setup(gateway: "ASAAS" | "MP", over: Record<string, unknown> = {}, student: Record<string, unknown> = {}) {
  row.findUnique.mockResolvedValue({
    id: "row1", enrollmentId: "enr1", tenantId: "t1", number: 1, amount: 250,
    dueDate: new Date("2026-11-06T12:00:00Z"), status: "SCHEDULED", gateway, method: null,
    asaasPaymentId: null, mpPaymentId: null, updatedAt: new Date(1000), ...over,
  })
  m(loadContext).mockResolvedValue({
    enrollment: {
      id: "enr1", tenantId: "t1", externalReference: "enr_enr1", flexInstallments: true, courseNome: "Cílios",
      student: { id: "s1", cep: null, rua: null, numero: null, bairro: null, cidade: null, estado: null, ...student },
    },
    tenant: { id: "t1", slug: "loja", name: "Loja", plataformaVendedorId: "v1", salesGateway: gateway, mpAccessToken: "enc", asaasApiKey: "enc" },
  })
}

const asaasPayment = (o: Record<string, unknown> = {}) => ({
  id: "pay_new", status: "PENDING", billingType: "PIX", value: 250, deleted: false, bankSlipUrl: null, ...o,
})
const mpPayment = (o: Record<string, unknown> = {}) => ({
  id: 77, status: "pending", transaction_amount: 250, payment_type_id: "bank_transfer", date_approved: null,
  point_of_interaction: { transaction_data: { qr_code: "mp-pix", qr_code_base64: "b64" } }, ...o,
})

beforeEach(() => {
  vi.clearAllMocks()
  lock.acquired = true
  row.update.mockResolvedValue({})
  row.findFirst.mockResolvedValue(null)
  m(asaas.listPayments).mockResolvedValue({ data: [] })
  m(asaas.deletePayment).mockResolvedValue({ deleted: true, id: "pay_old" })
})

describe("chargeFlexRow — Asaas", () => {
  it("PIX numa linha sem cobrança cria uma, com referência carne_ e grava a linha", async () => {
    setup("ASAAS")
    m(asaas.createPayment).mockResolvedValue(asaasPayment())
    const res = await chargeFlexRow({ rowId: "row1", method: "PIX", payer })
    expect(res).toEqual({ kind: "pending", pix: { qrCode: "pix-copia", qrCodeBase64: "img" } })
    const [params, key] = m(asaas.createPayment).mock.calls[0]
    expect(key).toBe("unit_key")
    expect(params).toMatchObject({ billingType: "PIX", value: 250, externalReference: "carne_enr1", customer: "cus_1" })
    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "row1" },
      data: expect.objectContaining({ asaasPaymentId: "pay_new", method: "PIX", status: "GENERATED", invoiceUrl: null }),
    }))
  })

  it("PIX de novo devolve a mesma cobrança sem criar outra", async () => {
    setup("ASAAS", { asaasPaymentId: "pay_old", method: "PIX", status: "GENERATED" })
    m(asaas.getPayment).mockResolvedValue(asaasPayment({ id: "pay_old" }))
    const res = await chargeFlexRow({ rowId: "row1", method: "PIX", payer })
    expect(res).toMatchObject({ kind: "pending", pix: { qrCode: "pix-copia" } })
    expect(asaas.createPayment).not.toHaveBeenCalled()
    expect(asaas.deletePayment).not.toHaveBeenCalled()
  })

  it("PIX → BOLETO apaga a anterior, confirma deleted e só então cria", async () => {
    setup("ASAAS", { asaasPaymentId: "pay_old", method: "PIX", status: "GENERATED" })
    m(asaas.getPayment)
      .mockResolvedValueOnce(asaasPayment({ id: "pay_old" }))
      .mockResolvedValueOnce(asaasPayment({ id: "pay_old", deleted: true }))
    m(asaas.createPayment).mockResolvedValue(asaasPayment({ billingType: "BOLETO", bankSlipUrl: "raw.pdf" }))
    const res = await chargeFlexRow({ rowId: "row1", method: "BOLETO", payer })
    expect(res).toEqual({ kind: "pending", boleto: { url: "boleto.pdf", digitableLine: "123" } })
    const del = m(asaas.deletePayment).mock.invocationCallOrder[0]
    const reread = m(asaas.getPayment).mock.invocationCallOrder[1]
    const create = m(asaas.createPayment).mock.invocationCallOrder[0]
    expect(del).toBeLessThan(reread)
    expect(reread).toBeLessThan(create)
    expect(m(asaas.createPayment).mock.calls[0][0]).toMatchObject({ billingType: "BOLETO" })
    // A linha guarda o PDF do boleto, nunca a fatura hospedada.
    expect(row.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ invoiceUrl: "boleto.pdf", digitableLine: "123" }),
    }))
  })

  it("DELETE sem deleted:true → 409 PREVIOUS_CHARGE_STUCK e nada é criado", async () => {
    setup("ASAAS", { asaasPaymentId: "pay_old", method: "PIX", status: "GENERATED" })
    m(asaas.getPayment).mockResolvedValue(asaasPayment({ id: "pay_old" }))
    m(asaas.deletePayment).mockResolvedValue({ deleted: false, id: "pay_old" })
    const res = await chargeFlexRow({ rowId: "row1", method: "BOLETO", payer })
    expect(res).toMatchObject({ kind: "error", httpStatus: 409, code: "PREVIOUS_CHARGE_STUCK" })
    expect(asaas.createPayment).not.toHaveBeenCalled()
  })

  it("leva o rateio da matrícula no payload", async () => {
    setup("ASAAS")
    const splits = [{ walletId: "w1", percentualValue: 30 }]
    m(asaasSplitsForEnrollment).mockResolvedValueOnce(splits)
    m(asaas.createPayment).mockResolvedValue(asaasPayment())
    await chargeFlexRow({ rowId: "row1", method: "PIX", payer })
    expect(asaasSplitsForEnrollment).toHaveBeenCalledWith("enr1")
    expect(m(asaas.createPayment).mock.calls[0][0].splits).toEqual(splits)
  })

  it("adota a cobrança órfã de uma tentativa que caiu antes de gravar a linha", async () => {
    setup("ASAAS")
    m(asaas.listPayments).mockResolvedValue({
      data: [asaasPayment({ id: "pay_orphan", dueDate: "2026-11-06" })],
    })
    vi.useFakeTimers({ now: new Date("2026-11-06T15:00:00Z"), toFake: ["Date"] })
    try {
      await chargeFlexRow({ rowId: "row1", method: "PIX", payer })
    } finally {
      vi.useRealTimers()
    }
    expect(asaas.createPayment).not.toHaveBeenCalled()
    expect(row.update.mock.calls[0][0].data.asaasPaymentId).toBe("pay_orphan")
  })

  it("cartão: cria a cobrança, grava a linha ANTES de capturar e baixa a parcela aprovada", async () => {
    setup("ASAAS")
    m(asaas.createPayment).mockResolvedValue(asaasPayment({ billingType: "CREDIT_CARD" }))
    m(asaas.payWithCreditCard).mockResolvedValue(asaasPayment({ status: "CONFIRMED", paymentDate: "2026-11-06" }))
    const card = {
      gateway: "ASAAS" as const,
      creditCard: { holderName: "L S", number: "4111", expiryMonth: "01", expiryYear: "2030", ccv: "123" },
      creditCardHolderInfo: { name: "L S", email: "l@x.com", cpfCnpj: "11418766550", postalCode: "01001000", addressNumber: "10", phone: "11999999999" },
    }
    const res = await chargeFlexRow({ rowId: "row1", method: "CREDIT_CARD", payer: { ...payer, remoteIp: "1.2.3.4" }, card })
    expect(res.kind).toBe("approved")
    expect(m(asaas.createPayment).mock.calls[0][0].creditCard).toBeUndefined()
    expect(row.update.mock.invocationCallOrder[0]).toBeLessThan(m(asaas.payWithCreditCard).mock.invocationCallOrder[0])
    expect(m(asaas.payWithCreditCard).mock.calls[0][1]).toMatchObject({ remoteIp: "1.2.3.4", creditCard: card.creditCard })
    expect(settleBoletoInstallment).toHaveBeenCalledWith(expect.objectContaining({
      tenant: expect.objectContaining({ id: "t1", isPmbVitrine: false }),
      event: expect.objectContaining({ gateway: "ASAAS", externalPaymentId: "pay_new", amount: 250 }),
    }))
  })

  it("lock ocupado → 409 PAYMENT_IN_PROGRESS sem tocar no gateway", async () => {
    setup("ASAAS")
    lock.acquired = false
    const res = await chargeFlexRow({ rowId: "row1", method: "PIX", payer })
    expect(res).toMatchObject({ kind: "error", httpStatus: 409, code: "PAYMENT_IN_PROGRESS" })
    expect(asaas.createPayment).not.toHaveBeenCalled()
  })
})

describe("chargeFlexRow — carnê antigo não muda", () => {
  for (const gateway of ["ASAAS", "MP"] as const) {
    it(`${gateway}: matrícula sem flexInstallments → 409 NOT_FLEX, sem apagar nem criar`, async () => {
      setup(gateway, { asaasPaymentId: "pay_old", mpPaymentId: "77", method: "BOLETO", status: "GENERATED" })
      const ctx = await m(loadContext).getMockImplementation()!()
      m(loadContext).mockResolvedValue({ ...ctx, enrollment: { ...ctx.enrollment, flexInstallments: false } })
      const res = await chargeFlexRow({ rowId: "row1", method: "PIX", payer })
      expect(res).toMatchObject({ kind: "error", httpStatus: 409, code: "NOT_FLEX" })
      for (const f of [asaas.getPayment, asaas.deletePayment, asaas.createPayment, mp.getPayment, mp.cancelPayment, mp.createPayment]) {
        expect(f).not.toHaveBeenCalled()
      }
      expect(row.update).not.toHaveBeenCalled()
    })
  }
})

describe("chargeFlexRow — Mercado Pago", () => {
  it("PIX numa linha sem cobrança cria um, com parc_<id> e chave por linha+updatedAt+método", async () => {
    setup("MP")
    m(mp.createPayment).mockResolvedValue(mpPayment())
    const res = await chargeFlexRow({ rowId: "row1", method: "PIX", payer })
    expect(res).toEqual({ kind: "pending", pix: { qrCode: "mp-pix", qrCodeBase64: "b64" } })
    const [token, params, key] = m(mp.createPayment).mock.calls[0]
    expect(token).toBe("mp_token")
    expect(params).toMatchObject({ payment_method_id: "pix", external_reference: "parc_row1", transaction_amount: 250 })
    expect(key).toBe("parc_row1:1000:PIX")
    expect(row.update.mock.calls[0][0].data).toMatchObject({ mpPaymentId: "77", method: "PIX", status: "GENERATED" })
  })

  it("PIX de novo devolve o mesmo sem criar", async () => {
    setup("MP", { mpPaymentId: "77", method: "PIX", status: "GENERATED" })
    m(mp.getPayment).mockResolvedValue(mpPayment())
    const res = await chargeFlexRow({ rowId: "row1", method: "PIX", payer })
    expect(res).toMatchObject({ kind: "pending", pix: { qrCode: "mp-pix" } })
    expect(mp.createPayment).not.toHaveBeenCalled()
    expect(mp.cancelPayment).not.toHaveBeenCalled()
  })

  it("PIX → BOLETO cancela o anterior antes de criar e salva o endereço recebido", async () => {
    setup("MP", { mpPaymentId: "77", method: "PIX", status: "GENERATED" })
    m(mp.getPayment).mockResolvedValue(mpPayment())
    m(mp.cancelPayment).mockResolvedValue(mpPayment({ status: "cancelled" }))
    m(mp.createPayment).mockResolvedValue(mpPayment({
      id: 78, point_of_interaction: undefined,
      transaction_details: { external_resource_url: "mp.pdf", digitable_line: "999" },
    }))
    const res = await chargeFlexRow({ rowId: "row1", method: "BOLETO", payer: { ...payer, address } })
    expect(res).toEqual({ kind: "pending", boleto: { url: "mp.pdf", digitableLine: "999" } })
    expect(m(mp.cancelPayment).mock.invocationCallOrder[0]).toBeLessThan(m(mp.createPayment).mock.invocationCallOrder[0])
    expect(saveBoletoAddress).toHaveBeenCalledWith("s1", address)
    expect(row.update.mock.calls[0][0].data).toMatchObject({ mpPaymentId: "78", invoiceUrl: "mp.pdf", digitableLine: "999" })
  })

  it("boleto sem endereço completo → 400 ADDRESS_REQUIRED, nada cancelado nem criado", async () => {
    setup("MP", { mpPaymentId: "77", method: "PIX", status: "GENERATED" })
    const res = await chargeFlexRow({ rowId: "row1", method: "BOLETO", payer: { ...payer, address: { ...address, numero: null } } })
    expect(res).toMatchObject({ kind: "error", httpStatus: 400, code: "ADDRESS_REQUIRED" })
    expect(mp.cancelPayment).not.toHaveBeenCalled()
    expect(mp.createPayment).not.toHaveBeenCalled()
  })

  it("cartão aprovado na hora → baixa a parcela", async () => {
    setup("MP")
    m(mp.createPayment).mockResolvedValue(mpPayment({
      status: "approved", payment_type_id: "credit_card", date_approved: "2026-11-06T10:00:00Z", point_of_interaction: undefined,
    }))
    const res = await chargeFlexRow({
      rowId: "row1", method: "CREDIT_CARD", payer,
      card: { gateway: "MP", token: "tok", paymentMethodId: "visa", issuerId: "25" },
    })
    expect(res.kind).toBe("approved")
    expect(m(mp.createPayment).mock.calls[0][1]).toMatchObject({ token: "tok", installments: 1, payment_method_id: "visa", issuer_id: "25" })
    expect(settleBoletoInstallment).toHaveBeenCalledWith(expect.objectContaining({
      event: expect.objectContaining({ gateway: "MP", externalPaymentId: "77", mpPaymentType: "credit_card" }),
    }))
  })
})
