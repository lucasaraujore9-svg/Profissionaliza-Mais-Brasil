import { beforeEach, describe, expect, it, vi } from "vitest"

// Pagamento da linha da vez pela página pública: o servidor recalcula a oferta
// (nunca confia no método que o form mandou), escopa pela loja e só grava o
// meio do plano quando a cobrança nova existe.

type Enr = Record<string, unknown> & { id: string; tenantId: string | null }
const db = vi.hoisted(() => ({ enrollments: [] as Enr[] }))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    enrollment: {
      findFirst: vi.fn(
        async ({ where, select }: { where: { id: string; tenantId: string | null }; select: { boletoInstallments?: { where?: { id?: string } } } }) => {
          const e = db.enrollments.find((x) => x.id === where.id && x.tenantId === where.tenantId)
          if (!e) return null
          const rowId = select.boletoInstallments?.where?.id
          const rows = e.boletoInstallments as { id: string }[]
          return { ...e, boletoInstallments: rowId ? rows.filter((r) => r.id === rowId) : rows }
        },
      ),
      update: vi.fn(async () => ({})),
    },
  },
}))
vi.mock("./flex-charge", () => ({
  chargeFlexRow: vi.fn(async () => ({ kind: "pending", pix: { qrCode: "qr", qrCodeBase64: "b64" } })),
}))
vi.mock("./flex-card", () => ({ startFlexCardSubscription: vi.fn(async () => ({ kind: "approved" })) }))

import { prisma } from "@/lib/prisma"
import { chargeFlexRow } from "./flex-charge"
import { startFlexCardSubscription } from "./flex-card"
import { flexPayResponse, payFlexRow } from "./flex-pay"

const NOW = new Date("2026-11-10T12:00:00Z")
const payer = { nome: "Ana", email: "ana@x.com", cpf: "12345678909" }
const card = { gateway: "MP" as const, token: "tok", paymentMethodId: "visa" }

function row(id: string, number: number, extra: Record<string, unknown> = {}) {
  return { id, number, status: "SCHEDULED", dueDate: NOW, cardDeclinedAt: null, gateway: "MP", ...extra }
}

function enrollment(extra: Partial<Enr> = {}): Enr {
  return {
    id: "enr_1",
    tenantId: "t1",
    status: "PENDING",
    flexInstallments: true,
    flexHasDownPayment: false,
    installmentMethod: null,
    asaasSubscriptionId: null,
    mpSubscriptionId: null,
    tenant: { status: "ACTIVE" },
    boletoInstallments: [row("r1", 1), row("r2", 2)],
    ...extra,
  }
}

const pay = (over: Partial<Parameters<typeof payFlexRow>[0]> = {}) =>
  payFlexRow({ enrollmentId: "enr_1", tenantId: "t1", rowId: "r1", method: "PIX", payer, ...over }, NOW)

beforeEach(() => {
  vi.clearAllMocks()
  db.enrollments = []
})

describe("payFlexRow", () => {
  it("entrada em aberto: POST da linha 2 → 409 METHOD_NOT_OFFERED", async () => {
    db.enrollments = [enrollment({ flexHasDownPayment: true })]
    const r = await pay({ rowId: "r2" })
    expect(r).toMatchObject({ kind: "error", httpStatus: 409, code: "METHOD_NOT_OFFERED" })
    expect(chargeFlexRow).not.toHaveBeenCalled()
  })

  it("plano em PIX: POST de BOLETO → 409 METHOD_NOT_OFFERED", async () => {
    db.enrollments = [
      enrollment({
        status: "ACTIVE",
        installmentMethod: "PIX",
        boletoInstallments: [row("r1", 1, { status: "PAID" }), row("r2", 2)],
      }),
    ]
    const r = await pay({ rowId: "r2", method: "BOLETO" })
    expect(r).toMatchObject({ kind: "error", httpStatus: 409, code: "METHOD_NOT_OFFERED" })
    expect(chargeFlexRow).not.toHaveBeenCalled()
  })

  it("linha negada no cartão + PIX → cobra e grava installmentMethod PIX depois", async () => {
    db.enrollments = [
      enrollment({
        status: "ACTIVE",
        installmentMethod: "CREDIT_CARD",
        boletoInstallments: [row("r1", 1, { status: "PAID" }), row("r2", 2, { cardDeclinedAt: NOW })],
      }),
    ]
    const r = await pay({ rowId: "r2", method: "PIX" })
    expect(r).toMatchObject({ kind: "pending" })
    expect(chargeFlexRow).toHaveBeenCalledWith({ rowId: "r2", method: "PIX", payer })
    expect(prisma.enrollment.update).toHaveBeenCalledWith({
      where: { id: "enr_1" },
      data: { installmentMethod: "PIX" },
    })
    const chargeOrder = vi.mocked(chargeFlexRow).mock.invocationCallOrder[0]
    const writeOrder = vi.mocked(prisma.enrollment.update).mock.invocationCallOrder[0]
    expect(chargeOrder).toBeLessThan(writeOrder)
  })

  it("cobrança falhou: meio do plano não muda", async () => {
    db.enrollments = [enrollment()]
    vi.mocked(chargeFlexRow).mockResolvedValueOnce({ kind: "error", httpStatus: 502, code: "X", error: "x" })
    await pay({ method: "BOLETO" })
    expect(prisma.enrollment.update).not.toHaveBeenCalled()
  })

  it("plano em PIX: pagar a linha em PIX não regrava o meio", async () => {
    db.enrollments = [
      enrollment({ installmentMethod: "PIX", boletoInstallments: [row("r1", 1, { status: "PAID" }), row("r2", 2)] }),
    ]
    await pay({ rowId: "r2", method: "PIX" })
    expect(chargeFlexRow).toHaveBeenCalled()
    expect(prisma.enrollment.update).not.toHaveBeenCalled()
  })

  it("meio nulo + CREDIT_CARD → startFlexCardSubscription a partir da linha da vez", async () => {
    db.enrollments = [enrollment()]
    const r = await pay({ method: "CREDIT_CARD", card })
    expect(r).toEqual({ kind: "approved" })
    expect(startFlexCardSubscription).toHaveBeenCalledWith({ enrollmentId: "enr_1", fromRowNumber: 1, payer, card })
    expect(chargeFlexRow).not.toHaveBeenCalled()
  })

  it("entrada no cartão → 1x avulsa e não define o meio", async () => {
    db.enrollments = [enrollment({ flexHasDownPayment: true })]
    await pay({ method: "CREDIT_CARD", card })
    expect(chargeFlexRow).toHaveBeenCalledWith({ rowId: "r1", method: "CREDIT_CARD", payer, card })
    expect(startFlexCardSubscription).not.toHaveBeenCalled()
    expect(prisma.enrollment.update).not.toHaveBeenCalled()
  })

  it("entrada no PIX não define o meio do plano", async () => {
    db.enrollments = [enrollment({ flexHasDownPayment: true })]
    await pay({ method: "PIX" })
    expect(chargeFlexRow).toHaveBeenCalled()
    expect(prisma.enrollment.update).not.toHaveBeenCalled()
  })

  it("cartão sem dados → 400 CARD_REQUIRED", async () => {
    db.enrollments = [enrollment()]
    const r = await pay({ method: "CREDIT_CARD" })
    expect(r).toMatchObject({ kind: "error", httpStatus: 400, code: "CARD_REQUIRED" })
  })

  it("matrícula de outra loja → 404", async () => {
    db.enrollments = [enrollment({ tenantId: "t2" })]
    const r = await pay()
    expect(r).toMatchObject({ kind: "error", httpStatus: 404 })
    expect(chargeFlexRow).not.toHaveBeenCalled()
  })

  it("matrícula da loja na rota da PMB (tenantId null) → 404", async () => {
    db.enrollments = [enrollment()]
    const r = await pay({ tenantId: null })
    expect(r).toMatchObject({ kind: "error", httpStatus: 404 })
  })

  it("matrícula que não é parcelada → 404", async () => {
    db.enrollments = [enrollment({ flexInstallments: false })]
    const r = await pay()
    expect(r).toMatchObject({ kind: "error", httpStatus: 404 })
  })

  it("linha de outra matrícula → 404", async () => {
    db.enrollments = [enrollment()]
    const r = await pay({ rowId: "r_outra" })
    expect(r).toMatchObject({ kind: "error", httpStatus: 404 })
  })

  it.each(["CANCELLED", "COMPLETED"])("matrícula %s → 409", async (status) => {
    db.enrollments = [enrollment({ status })]
    const r = await pay()
    expect(r).toMatchObject({ kind: "error", httpStatus: 409 })
  })

  it("loja inativa → 403", async () => {
    db.enrollments = [enrollment({ tenant: { status: "SUSPENDED" } })]
    const r = await pay()
    expect(r).toMatchObject({ kind: "error", httpStatus: 403, code: "TENANT_INACTIVE" })
  })
})

describe("flexPayResponse (formData dos formulários → meio)", () => {
  const student = {
    id: "s1", nome: "Ana", email: "ana@x.com", cpf: "12345678909", fone: "31999990000",
    responsavel: null, cpfResponsavel: null, responsavelEmail: null, responsavelFone: null,
    asaasCustomerId: null, responsavelAsaasCustomerId: null,
  }
  const post = (body: unknown) =>
    flexPayResponse(
      new Request("http://x/api/loja/checkout/parcela", {
        method: "POST",
        headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" },
        body: JSON.stringify(body),
      }),
      "t1",
    )

  it("MP bolbradesco → BOLETO com o endereço digitado; resposta no shape da loja", async () => {
    db.enrollments = [enrollment({ student })]
    vi.mocked(chargeFlexRow).mockResolvedValueOnce({ kind: "pending", boleto: { url: "u", digitableLine: "1" } })
    const res = await post({
      enrollmentId: "enr_1",
      boletoInstallmentId: "r1",
      formData: {
        payment_method_id: "bolbradesco",
        payer: { address: { zip_code: "30000000", street_name: "Rua", street_number: 10, neighborhood: "B", city: "C", federal_unit: "MG" } },
      },
    })
    expect(await res.json()).toEqual({ data: { status: "pending", boleto: { url: "u", digitableLine: "1" } } })
    expect(chargeFlexRow).toHaveBeenCalledWith({
      rowId: "r1",
      method: "BOLETO",
      payer: expect.objectContaining({
        cpf: "12345678909",
        remoteIp: "1.2.3.4",
        address: { cep: "30000000", rua: "Rua", numero: "10", bairro: "B", cidade: "C", estado: "MG" },
      }),
    })
  })

  it("Asaas CREDIT_CARD → cartão com titular do banco; erro sai como {error, code}", async () => {
    db.enrollments = [enrollment({ student, boletoInstallments: [row("r1", 1, { gateway: "ASAAS" }), row("r2", 2)] })]
    vi.mocked(startFlexCardSubscription).mockResolvedValueOnce({
      kind: "error", httpStatus: 400, code: "PAYMENT_REJECTED", error: "recusado",
    })
    const res = await post({
      enrollmentId: "enr_1",
      boletoInstallmentId: "r1",
      formData: {
        method: "CREDIT_CARD",
        card: { holderName: "ANA S", number: "4111 1111 1111 1111", expiryMonth: "12", expiryYear: "30", ccv: "123" },
        postalCode: "30000-000",
        addressNumber: "10",
      },
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "recusado", code: "PAYMENT_REJECTED" })
    expect(startFlexCardSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        fromRowNumber: 1,
        card: expect.objectContaining({
          gateway: "ASAAS",
          creditCard: expect.objectContaining({ number: "4111111111111111", expiryYear: "2030" }),
          creditCardHolderInfo: expect.objectContaining({ cpfCnpj: "12345678909", postalCode: "30000000" }),
        }),
      }),
    )
  })

  it("sem boletoInstallmentId → 400", async () => {
    const res = await post({ enrollmentId: "enr_1", formData: { method: "PIX" } })
    expect(res.status).toBe(400)
  })
})
