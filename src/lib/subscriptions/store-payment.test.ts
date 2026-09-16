import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Pagamento, na loja da unidade, da assinatura vendida pela venda direta.
 *
 * O que precisa ficar de pé: a cobrança nasce na conta DA UNIDADE, com o preço
 * e a periodicidade CONGELADOS na venda, uma única vez por assinatura — e nunca
 * para uma assinatura de outra loja.
 */

const db = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
}))
const payments = vi.hoisted(() => ({ findMany: vi.fn(), findFirst: vi.fn() }))
const asaas = vi.hoisted(() => ({
  getPayment: vi.fn(),
  listPayments: vi.fn(),
  payWithCreditCard: vi.fn(),
}))
const lock = vi.hoisted(() => ({ acquired: true }))

vi.mock("@/lib/prisma", () => ({
  prisma: { studentSubscription: db, subscriptionPayment: payments },
}))
vi.mock("@/lib/enrollment/fulfill", () => ({
  advisoryLockKeyFrom: () => BigInt(1),
  withAdvisoryLock: vi.fn(async (_key: bigint, fn: () => Promise<void>) => {
    if (!lock.acquired) return false
    await fn()
    return true
  }),
}))
vi.mock("./checkout", () => ({
  createSubscriptionAtGateway: vi.fn(async () => ({ authorized: true })),
  asaasInstrumentFor: vi.fn(async (_p: unknown, method: string) =>
    method === "PIX"
      ? { pix: { qrCode: "pix-copia-e-cola", qrCodeBase64: "b64" } }
      : { boleto: { url: "https://asaas.test/b/pdf/pay_open", digitableLine: "00190" } },
  ),
  SubscriptionCheckoutInputError: class extends Error {},
}))
vi.mock("./renew", () => ({ settleSubscriptionCycle: vi.fn(async () => ({ settled: true })) }))
vi.mock("./carne", () => {
  class CarneInputError extends Error {}
  return {
    CarneInputError,
    startSelfServiceCarne: vi.fn(async () => ({
      count: 1,
      amount: 90,
      firstBoleto: { url: "https://mp.test/boleto.pdf", digitableLine: "2379" },
    })),
    resetSubscriptionCarne: vi.fn(async () => undefined),
  }
})
vi.mock("./plans", () => ({
  getPlanForCheckout: vi.fn(async () => ({
    id: "plan_1",
    name: "Plano",
    slug: "plano",
    // Preço e periodicidade de HOJE no catálogo — diferentes da venda.
    price: 150,
    interval: "MONTHLY",
    scope: {},
  })),
}))
vi.mock("@/lib/asaas/client", () => ({
  decryptTenantAsaasKey: (v: string) => `dec:${v}`,
  motherAsaasKey: () => "MOTHER_KEY",
  AsaasApiError: class extends Error {},
  ...asaas,
}))
vi.mock("@/lib/mercadopago/client", () => ({
  decryptTenantMpToken: (v: string) => `dec:${v}`,
}))
vi.mock("@/lib/logger", () => {
  const noop = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  return { contextLogger: () => noop, logger: noop }
})

import { createSubscriptionAtGateway } from "./checkout"
import { settleSubscriptionCycle } from "./renew"
import { CarneInputError, resetSubscriptionCarne, startSelfServiceCarne } from "./carne"
import { getPlanForCheckout } from "./plans"
import { payStoreSubscription } from "./store-payment"

const gatewayCall = createSubscriptionAtGateway as unknown as ReturnType<typeof vi.fn>
const planLookup = getPlanForCheckout as unknown as ReturnType<typeof vi.fn>
const startCarne = startSelfServiceCarne as unknown as ReturnType<typeof vi.fn>
const resetCarne = resetSubscriptionCarne as unknown as ReturnType<typeof vi.fn>

const mpTenant = {
  id: "t1",
  slug: "conecta",
  salesGateway: "MP",
  asaasApiKey: null,
  asaasWebhookToken: null,
  mpAccessToken: "enc_mp",
  mpPublicKey: "pk",
}

const asaasTenant = {
  ...mpTenant,
  salesGateway: "ASAAS",
  asaasApiKey: "enc_asaas",
  asaasWebhookToken: "wh",
  mpAccessToken: null,
  mpPublicKey: null,
}

function pendingSub(over: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    status: "PENDING",
    planId: "plan_1",
    priceAtPurchase: 90,
    interval: "QUARTERLY",
    tenantId: "t1",
    gateway: "MP",
    mpPreapprovalId: null,
    asaasSubscriptionId: null,
    externalReference: null,
    boletoCarne: false,
    studentId: "stu_1",
    student: {
      id: "stu_1",
      nome: "Aluno",
      email: "a@x.com",
      cpf: "39053344705",
      fone: "31999999999",
      responsavel: null,
      cpfResponsavel: null,
      responsavelEmail: null,
      responsavelFone: null,
      asaasCustomerId: null,
      responsavelAsaasCustomerId: null,
    },
    ...over,
  }
}

const mpCard = {
  subscriptionId: "sub_1",
  paymentMethod: "CREDIT_CARD" as const,
  cardToken: "tok_1",
}

beforeEach(() => {
  vi.clearAllMocks()
  lock.acquired = true
  db.findFirst.mockResolvedValue(pendingSub())
  db.findUnique.mockResolvedValue(pendingSub())
  payments.findMany.mockResolvedValue([])
})

/** A linha como o lock a relê: é ela que decide o caminho. */
function rowIs(over: Record<string, unknown>) {
  db.findFirst.mockResolvedValue(pendingSub(over))
  db.findUnique.mockResolvedValue(pendingSub(over))
}

describe("payStoreSubscription", () => {
  it("só enxerga assinatura DESTA loja (tenantId no where)", async () => {
    db.findFirst.mockResolvedValueOnce(null)
    const res = await payStoreSubscription(mpTenant, mpCard)
    expect(db.findFirst.mock.calls[0][0].where).toEqual({
      id: "sub_1",
      tenantId: "t1",
    })
    expect(res).toMatchObject({ ok: false, status: 404 })
    expect(gatewayCall).not.toHaveBeenCalled()
  })

  it("cobra com o preço e a periodicidade CONGELADOS na venda", async () => {
    const res = await payStoreSubscription(mpTenant, mpCard)
    expect(res).toEqual({ ok: true, authorized: true })
    const [input, gateway] = gatewayCall.mock.calls[0]
    expect(gateway).toBe("MP")
    expect(input.plan.price).toBe(90)
    expect(input.plan.interval).toBe("QUARTERLY")
    expect(input.cardToken).toBe("tok_1")
    expect(input.payer.cpf).toBe("39053344705")
  })

  it("usa a conta da UNIDADE, nunca a conta-mãe", async () => {
    await payStoreSubscription(mpTenant, mpCard)
    expect(gatewayCall.mock.calls[0][2]).toEqual({
      asaasApiKey: undefined,
      mpAccessToken: "dec:enc_mp",
      tenantSlug: "conecta",
    })
  })

  it("recorrência no MP não aceita PIX", async () => {
    const res = await payStoreSubscription(mpTenant, {
      subscriptionId: "sub_1",
      paymentMethod: "PIX",
    })
    expect(res).toMatchObject({ ok: false, code: "METHOD_NOT_SUPPORTED" })
    expect(gatewayCall).not.toHaveBeenCalled()
  })

  it("Asaas aceita PIX e cobra na chave da unidade", async () => {
    const res = await payStoreSubscription(asaasTenant, {
      subscriptionId: "sub_1",
      paymentMethod: "PIX",
    })
    expect(res.ok).toBe(true)
    expect(gatewayCall.mock.calls[0][1]).toBe("ASAAS")
    expect(gatewayCall.mock.calls[0][2].asaasApiKey).toBe("dec:enc_asaas")
  })

  it("cartão no MP sem token é recusado antes do gateway", async () => {
    const res = await payStoreSubscription(mpTenant, {
      subscriptionId: "sub_1",
      paymentMethod: "CREDIT_CARD",
    })
    expect(res).toMatchObject({ ok: false, code: "CARD_REQUIRED" })
    expect(gatewayCall).not.toHaveBeenCalled()
  })

  it("recorrência do MP já autorizada não gera outra preapproval", async () => {
    rowIs({ mpPreapprovalId: "pre_old", externalReference: "pmb_sub_sub_1" })
    const res = await payStoreSubscription(mpTenant, mpCard)
    expect(res).toMatchObject({ ok: false, code: "PAYMENT_ALREADY_STARTED" })
    expect(gatewayCall).not.toHaveBeenCalled()
  })

  it("re-checa DENTRO do lock: o clique concorrente que chegou antes vence", async () => {
    db.findUnique.mockResolvedValueOnce(
      pendingSub({ mpPreapprovalId: "pre_1", externalReference: "pmb_sub_sub_1" }),
    )
    const res = await payStoreSubscription(mpTenant, mpCard)
    expect(res).toMatchObject({ ok: false, code: "PAYMENT_ALREADY_STARTED" })
    expect(gatewayCall).not.toHaveBeenCalled()
  })

  it("lock ocupado não cobra", async () => {
    lock.acquired = false
    const res = await payStoreSubscription(mpTenant, mpCard)
    expect(res).toMatchObject({ ok: false, code: "PAYMENT_IN_PROGRESS" })
    expect(gatewayCall).not.toHaveBeenCalled()
  })

  it("assinatura já ativa não é cobrada de novo", async () => {
    rowIs({ status: "ACTIVE" })
    const res = await payStoreSubscription(mpTenant, mpCard)
    expect(res).toMatchObject({ ok: false, code: "SUBSCRIPTION_ALREADY_PAID" })
    expect(gatewayCall).not.toHaveBeenCalled()
  })

  it("plano que saiu da vitrine fecha a venda", async () => {
    planLookup.mockResolvedValueOnce(null)
    const res = await payStoreSubscription(mpTenant, mpCard)
    expect(res).toMatchObject({ ok: false, code: "PLAN_UNAVAILABLE" })
    expect(gatewayCall).not.toHaveBeenCalled()
  })

  it("loja sem gateway pronto não cobra em lugar nenhum", async () => {
    const res = await payStoreSubscription(
      { ...mpTenant, mpAccessToken: null },
      mpCard,
    )
    expect(res).toMatchObject({ ok: false, code: "GATEWAY_NOT_READY" })
    expect(db.findFirst).not.toHaveBeenCalled()
  })

  it("cartão recusado deixa o link pronto para nova tentativa (502, sem ids gravados)", async () => {
    gatewayCall.mockRejectedValueOnce(new Error("cc_rejected"))
    const res = await payStoreSubscription(mpTenant, mpCard)
    expect(res).toMatchObject({ ok: false, status: 502, code: "GATEWAY_FAILED" })
  })
})

// ── Fatura que JÁ existe no Asaas (1º ciclo emitido, renovação) ─────────────
// A página da plataforma é o único lugar de pagar. Ela paga ESTA cobrança — nunca
// cria outra por cima, e nunca manda o aluno para a fatura do Asaas.

function openCharge(over: Record<string, unknown> = {}) {
  return {
    id: "pay_open",
    status: "OVERDUE",
    deleted: false,
    value: 90,
    dueDate: "2026-09-10",
    paymentDate: null,
    bankSlipUrl: null,
    ...over,
  }
}

describe("payStoreSubscription — cobrança aberta no Asaas", () => {
  const asaasRow = {
    gateway: "ASAAS",
    status: "PAST_DUE",
    asaasSubscriptionId: "sub_asaas",
    externalReference: "pmb_sub_sub_1",
  }

  it("PIX da renovação sai da cobrança existente, sem criar assinatura nova", async () => {
    rowIs(asaasRow)
    payments.findMany.mockResolvedValue([{ asaasPaymentId: "pay_open" }])
    asaas.getPayment.mockResolvedValue(openCharge())

    const res = await payStoreSubscription(asaasTenant, {
      subscriptionId: "sub_1",
      paymentMethod: "PIX",
    })

    expect(res).toMatchObject({ ok: true, authorized: false, pix: { qrCode: "pix-copia-e-cola" } })
    expect(asaas.getPayment).toHaveBeenCalledWith("pay_open", "dec:enc_asaas")
    expect(gatewayCall).not.toHaveBeenCalled()
    expect(JSON.stringify(res)).not.toContain("invoice")
  })

  it("sem ciclo registrado (webhook atrasado), acha a cobrança pela recorrência no Asaas", async () => {
    rowIs({ ...asaasRow, status: "PENDING" })
    asaas.listPayments.mockResolvedValue({
      data: [openCharge({ id: "pay_2", status: "PENDING", dueDate: "2026-10-10" })],
    })

    const res = await payStoreSubscription(asaasTenant, {
      subscriptionId: "sub_1",
      paymentMethod: "BOLETO",
    })

    expect(asaas.listPayments.mock.calls[0][0]).toMatchObject({ subscription: "sub_asaas" })
    expect(res).toMatchObject({ ok: true, boleto: { digitableLine: "00190" } })
    expect(gatewayCall).not.toHaveBeenCalled()
  })

  it("cartão paga a cobrança existente e liquida o ciclo na hora", async () => {
    rowIs(asaasRow)
    payments.findMany.mockResolvedValue([{ asaasPaymentId: "pay_open" }])
    asaas.getPayment.mockResolvedValue(openCharge())
    asaas.payWithCreditCard.mockResolvedValue(
      openCharge({ status: "CONFIRMED", paymentDate: "2026-09-14" }),
    )

    const res = await payStoreSubscription(asaasTenant, {
      subscriptionId: "sub_1",
      paymentMethod: "CREDIT_CARD",
      creditCard: {
        holderName: "ALUNO",
        number: "4111111111111111",
        expiryMonth: "12",
        expiryYear: "2030",
        ccv: "123",
      },
      creditCardHolder: { postalCode: "01001000", addressNumber: "1" },
    })

    expect(res).toEqual({ ok: true, authorized: true })
    expect(asaas.payWithCreditCard.mock.calls[0][0]).toBe("pay_open")
    expect(settleSubscriptionCycle).toHaveBeenCalledWith(
      "sub_1",
      expect.objectContaining({ externalPaymentId: "pay_open", gateway: "ASAAS" }),
    )
    expect(gatewayCall).not.toHaveBeenCalled()
  })

  it("assinatura em dia sem cobrança aberta não é cobrada", async () => {
    rowIs({ ...asaasRow, status: "ACTIVE" })
    asaas.listPayments.mockResolvedValue({ data: [] })

    const res = await payStoreSubscription(asaasTenant, {
      subscriptionId: "sub_1",
      paymentMethod: "PIX",
    })

    expect(res).toMatchObject({ ok: false, code: "NO_OPEN_CHARGE" })
    expect(gatewayCall).not.toHaveBeenCalled()
  })
})

describe("payStoreSubscription — vitrine PMB", () => {
  it("só enxerga assinatura da PMB e cobra na conta-mãe", async () => {
    rowIs({ tenantId: null, gateway: "ASAAS" })

    await payStoreSubscription(null, { subscriptionId: "sub_1", paymentMethod: "PIX" })

    expect(db.findFirst.mock.calls[0][0].where).toEqual({ id: "sub_1", tenantId: null })
    expect(gatewayCall.mock.calls[0][1]).toBe("ASAAS")
    // Sem chave: `createSubscriptionAtGateway` cai na conta-mãe e o assert de
    // isolamento confirma que é mesmo venda da PMB.
    expect(gatewayCall.mock.calls[0][2]).toEqual({})
  })
})

describe("payStoreSubscription — assinatura NO BOLETO", () => {
  const ADDRESS = {
    cep: "30110000",
    rua: "Rua A",
    numero: "10",
    bairro: "Centro",
    cidade: "Belo Horizonte",
    estado: "MG",
  }

  it("boleto no Mercado Pago vira carnê na conta da loja (antes só existia cartão)", async () => {
    const res = await payStoreSubscription(mpTenant, {
      subscriptionId: "sub_1",
      paymentMethod: "BOLETO",
      enderecoBoleto: ADDRESS,
    })
    expect(res).toEqual({
      ok: true,
      authorized: false,
      boleto: { url: "https://mp.test/boleto.pdf", digitableLine: "2379" },
    })
    expect(startCarne).toHaveBeenCalledWith({
      subscriptionId: "sub_1",
      studentId: "stu_1",
      address: ADDRESS,
    })
    // Nenhuma recorrência no gateway: quem emite os boletos é a plataforma.
    expect(gatewayCall).not.toHaveBeenCalled()
  })

  it("boleto no Asaas também é carnê — as duas pontas seguem o mesmo desenho", async () => {
    rowIs({ gateway: "ASAAS" })
    const res = await payStoreSubscription(asaasTenant, {
      subscriptionId: "sub_1",
      paymentMethod: "BOLETO",
      enderecoBoleto: ADDRESS,
    })
    expect(res.ok).toBe(true)
    expect(startCarne).toHaveBeenCalledWith(
      // O Asaas não pede endereço no boleto: não se grava o que não se usa.
      expect.objectContaining({ subscriptionId: "sub_1", address: undefined }),
    )
    expect(gatewayCall).not.toHaveBeenCalled()
  })

  it("loja que trocou de gateway emite o carnê no gateway de AGORA", async () => {
    // Venda feita com a loja no MP; hoje ela recebe pelo Asaas.
    await payStoreSubscription(asaasTenant, { subscriptionId: "sub_1", paymentMethod: "BOLETO" })
    expect(db.update).toHaveBeenCalledWith({
      where: { id: "sub_1" },
      data: { gateway: "ASAAS" },
    })
  })

  it("boleto que não sai devolve a assinatura ao estado de antes — o link continua valendo", async () => {
    startCarne.mockRejectedValueOnce(new CarneInputError("Informe o endereço completo do aluno"))
    const res = await payStoreSubscription(mpTenant, { subscriptionId: "sub_1", paymentMethod: "BOLETO" })
    expect(res).toMatchObject({ ok: false, status: 400, code: "CARNE_INVALID" })
    expect(resetCarne).toHaveBeenCalledWith("sub_1")
  })

  it("carnê do MP: a página devolve o boleto em aberto, sem criar cobrança", async () => {
    rowIs({ boletoCarne: true, status: "ACTIVE", externalReference: "pmb_sub_sub_1" })
    payments.findFirst.mockResolvedValue({ bankSlipUrl: "https://mp.test/b2.pdf", digitableLine: "999" })
    const res = await payStoreSubscription(mpTenant, { subscriptionId: "sub_1", paymentMethod: "BOLETO" })
    expect(res).toEqual({
      ok: true,
      authorized: false,
      boleto: { url: "https://mp.test/b2.pdf", digitableLine: "999" },
    })
    expect(startCarne).not.toHaveBeenCalled()
    expect(gatewayCall).not.toHaveBeenCalled()
  })

  it("carnê do MP não troca de meio: o boleto é um pagamento próprio", async () => {
    rowIs({ boletoCarne: true, status: "ACTIVE", externalReference: "pmb_sub_sub_1" })
    payments.findFirst.mockResolvedValue({ bankSlipUrl: "https://mp.test/b2.pdf", digitableLine: null })
    const res = await payStoreSubscription(mpTenant, mpCard)
    expect(res).toMatchObject({ ok: false, code: "METHOD_NOT_SUPPORTED" })
  })

  it("carnê do MP sem boleto emitido ainda não cobra nada", async () => {
    rowIs({ boletoCarne: true, status: "ACTIVE", externalReference: "pmb_sub_sub_1" })
    payments.findFirst.mockResolvedValue(null)
    const res = await payStoreSubscription(mpTenant, { subscriptionId: "sub_1", paymentMethod: "BOLETO" })
    expect(res).toMatchObject({ ok: false, code: "NO_OPEN_CHARGE" })
  })

  it("carnê do Asaas: o boleto em aberto se paga por PIX, sem cobrança nova", async () => {
    rowIs({
      boletoCarne: true,
      gateway: "ASAAS",
      status: "ACTIVE",
      externalReference: "pmb_sub_sub_1",
    })
    payments.findMany.mockResolvedValue([{ asaasPaymentId: "pay_open" }])
    asaas.getPayment.mockResolvedValue(openCharge())
    const res = await payStoreSubscription(asaasTenant, { subscriptionId: "sub_1", paymentMethod: "PIX" })
    expect(res).toMatchObject({ ok: true, pix: { qrCode: "pix-copia-e-cola" } })
    expect(startCarne).not.toHaveBeenCalled()
    expect(gatewayCall).not.toHaveBeenCalled()
  })
})
