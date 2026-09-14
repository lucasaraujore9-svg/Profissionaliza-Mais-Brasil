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
}))
const lock = vi.hoisted(() => ({ acquired: true }))

vi.mock("@/lib/prisma", () => ({
  prisma: { studentSubscription: db },
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
  createSubscriptionAtGateway: vi.fn(async () => ({
    invoiceUrl: null,
    initPoint: null,
    authorized: true,
  })),
}))
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
}))
vi.mock("@/lib/mercadopago/client", () => ({
  decryptTenantMpToken: (v: string) => `dec:${v}`,
}))
vi.mock("@/lib/logger", () => {
  const noop = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  return { contextLogger: () => noop, logger: noop }
})

import { createSubscriptionAtGateway } from "./checkout"
import { getPlanForCheckout } from "./plans"
import { payStoreSubscription } from "./store-payment"

const gatewayCall = createSubscriptionAtGateway as unknown as ReturnType<typeof vi.fn>
const planLookup = getPlanForCheckout as unknown as ReturnType<typeof vi.fn>

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
    mpPreapprovalId: null,
    asaasSubscriptionId: null,
    externalReference: null,
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
})

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
    expect(res).toEqual({ ok: true, invoiceUrl: null, authorized: true })
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

  it("recorrência no MP só no cartão", async () => {
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

  it("assinatura que já tem cobrança no gateway não gera outra", async () => {
    db.findFirst.mockResolvedValueOnce(pendingSub({ mpPreapprovalId: "pre_old" }))
    const res = await payStoreSubscription(mpTenant, mpCard)
    expect(res).toMatchObject({ ok: false, code: "PAYMENT_ALREADY_STARTED" })
    expect(gatewayCall).not.toHaveBeenCalled()
  })

  it("re-checa DENTRO do lock: o clique concorrente que chegou antes vence", async () => {
    db.findUnique.mockResolvedValueOnce(pendingSub({ externalReference: "pmb_sub_sub_1" }))
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
    db.findFirst.mockResolvedValueOnce(pendingSub({ status: "ACTIVE" }))
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
