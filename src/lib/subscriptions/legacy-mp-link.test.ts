import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Remediação dos links do Mercado Pago da venda direta de assinatura.
 *
 * O que precisa ficar de pé: nada é destruído sem ler o estado VIVO no MP,
 * quem já autorizou nunca é cancelado, o link morre no MP antes de a linha
 * mudar aqui, e a reemissão preserva as condições da venda com uma linha NOVA
 * (a antiga carrega a chave de idempotência do preapproval pendente).
 */

const db = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}))
const mp = vi.hoisted(() => ({
  getPreapproval: vi.fn(),
  cancelPreapproval: vi.fn(),
}))
const plans = vi.hoisted(() => ({ getPlanForCheckout: vi.fn() }))
const audit = vi.hoisted(() => ({ logAudit: vi.fn(async () => undefined) }))

vi.mock("@/lib/prisma", () => ({ prisma: { studentSubscription: db } }))
vi.mock("@/lib/mercadopago/client", () => mp)
vi.mock("@/lib/enrollment/gateway-credentials", () => ({
  resolveEnrollmentGatewayKeys: vi.fn(async () => ({ mpAccessToken: "tok_unidade" })),
}))
vi.mock("./plans", () => plans)
vi.mock("./direct-sale", () => ({
  storeSubscriptionPaymentPath: (id: string) => `/pagar/assinatura/${id}`,
}))
vi.mock("@/lib/audit", () => audit)

import { decideLegacyLink, remediateLegacyMpLinks } from "./legacy-mp-link"

function legacySub(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_old",
    studentId: "stu_1",
    tenantId: "ten_1",
    planId: "plan_1",
    priceAtPurchase: 49.9,
    interval: "MONTHLY",
    soldByUserId: "user_vendedor",
    couponId: null,
    checkoutUrl:
      "https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=pre_1",
    mpPreapprovalId: "pre_1",
    tenant: {
      slug: "conecta",
      customDomain: "loja.conecta.com.br",
      domainVerified: true,
      salesGateway: "MP",
      asaasApiKey: null,
      asaasWebhookToken: null,
      mpAccessToken: "enc",
      mpPublicKey: "pk",
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  db.findMany.mockResolvedValue([legacySub()])
  db.updateMany.mockResolvedValue({ count: 1 })
  db.create.mockResolvedValue({ id: "sub_new" })
  db.update.mockResolvedValue({})
  mp.getPreapproval.mockResolvedValue({ status: "pending" })
  mp.cancelPreapproval.mockResolvedValue({ status: "cancelled" })
  plans.getPlanForCheckout.mockResolvedValue({ id: "plan_1", price: 99, interval: "YEARLY" })
})

describe("decideLegacyLink", () => {
  it("estado ilegível no MP não destrói nada", () => {
    expect(decideLegacyLink({ mpStatus: null, canReissue: true })).toBe("unverified")
  })

  it("aluno que já autorizou ou pausou vai para revisão manual", () => {
    expect(decideLegacyLink({ mpStatus: "authorized", canReissue: true })).toBe("manual_review")
    expect(decideLegacyLink({ mpStatus: "paused", canReissue: true })).toBe("manual_review")
  })

  it("pendente reemite quando a loja ainda vende o plano, senão só cancela", () => {
    expect(decideLegacyLink({ mpStatus: "pending", canReissue: true })).toBe("cancel_and_reissue")
    expect(decideLegacyLink({ mpStatus: "pending", canReissue: false })).toBe("cancel_only")
    expect(decideLegacyLink({ mpStatus: "cancelled", canReissue: false })).toBe("cancel_only")
  })
})

describe("remediateLegacyMpLinks", () => {
  it("dry-run lê o estado, mas não cancela, não escreve e não reemite", async () => {
    const [out] = await remediateLegacyMpLinks({ apply: false })

    expect(out).toMatchObject({ decision: "cancel_and_reissue", applied: false })
    expect(mp.getPreapproval).toHaveBeenCalledWith("tok_unidade", "pre_1")
    expect(mp.cancelPreapproval).not.toHaveBeenCalled()
    expect(db.updateMany).not.toHaveBeenCalled()
    expect(db.create).not.toHaveBeenCalled()
  })

  it("cancela no MP com o token da unidade ANTES de cancelar a linha", async () => {
    await remediateLegacyMpLinks({ apply: true })

    expect(mp.cancelPreapproval).toHaveBeenCalledWith("tok_unidade", "pre_1")
    expect(mp.cancelPreapproval.mock.invocationCallOrder[0]).toBeLessThan(
      db.updateMany.mock.invocationCallOrder[0],
    )
    expect(db.updateMany).toHaveBeenCalledWith({
      where: { id: "sub_old", status: "PENDING", mpPreapprovalId: "pre_1" },
      data: expect.objectContaining({ status: "CANCELLED", checkoutUrl: null }),
    })
  })

  it("reemite numa linha nova com as condições CONGELADAS e o link da loja", async () => {
    const [out] = await remediateLegacyMpLinks({ apply: true })

    const data = db.create.mock.calls[0][0].data
    // Preço e periodicidade da venda, nunca os de hoje do catálogo (99/YEARLY).
    expect(data).toMatchObject({
      studentId: "stu_1",
      tenantId: "ten_1",
      planId: "plan_1",
      status: "PENDING",
      priceAtPurchase: 49.9,
      interval: "MONTHLY",
      soldByUserId: "user_vendedor",
      gateway: "MP",
    })
    // Sem ids de gateway: a cobrança nasce na loja, com chave de idempotência nova.
    expect(data).not.toHaveProperty("mpPreapprovalId")
    expect(data).not.toHaveProperty("externalReference")

    expect(db.update).toHaveBeenCalledWith({
      where: { id: "sub_new" },
      data: { checkoutUrl: "https://loja.conecta.com.br/pagar/assinatura/sub_new" },
    })
    expect(out).toMatchObject({
      applied: true,
      newSubscriptionId: "sub_new",
      newCheckoutUrl: "https://loja.conecta.com.br/pagar/assinatura/sub_new",
    })
    expect(audit.logAudit).toHaveBeenCalledTimes(1)
  })

  it("quem já autorizou no MP não é tocado", async () => {
    mp.getPreapproval.mockResolvedValue({ status: "authorized" })

    const [out] = await remediateLegacyMpLinks({ apply: true })

    expect(out.decision).toBe("manual_review")
    expect(mp.cancelPreapproval).not.toHaveBeenCalled()
    expect(db.updateMany).not.toHaveBeenCalled()
    expect(db.create).not.toHaveBeenCalled()
  })

  it("falha ao ler o MP não destrói nada", async () => {
    mp.getPreapproval.mockRejectedValue(new Error("404"))

    const [out] = await remediateLegacyMpLinks({ apply: true })

    expect(out.decision).toBe("unverified")
    expect(mp.cancelPreapproval).not.toHaveBeenCalled()
    expect(db.updateMany).not.toHaveBeenCalled()
  })

  it("falha ao cancelar no MP deixa a linha como está", async () => {
    mp.cancelPreapproval.mockRejectedValue(new Error("500"))

    const [out] = await remediateLegacyMpLinks({ apply: true })

    expect(out.applied).toBe(false)
    expect(out.error).toMatch(/cancelar no MP/)
    expect(db.updateMany).not.toHaveBeenCalled()
    expect(db.create).not.toHaveBeenCalled()
  })

  it("loja que não vende mais o plano: cancela sem reemitir", async () => {
    plans.getPlanForCheckout.mockResolvedValue(null)

    const [out] = await remediateLegacyMpLinks({ apply: true })

    expect(out).toMatchObject({ decision: "cancel_only", applied: true })
    expect(mp.cancelPreapproval).toHaveBeenCalled()
    expect(db.updateMany).toHaveBeenCalled()
    expect(db.create).not.toHaveBeenCalled()
  })

  it("já cancelado no MP: não repete o PUT, mas limpa a linha", async () => {
    mp.getPreapproval.mockResolvedValue({ status: "cancelled" })

    await remediateLegacyMpLinks({ apply: true })

    expect(mp.cancelPreapproval).not.toHaveBeenCalled()
    expect(db.updateMany).toHaveBeenCalled()
  })

  it("linha que mudou desde a leitura não é reemitida", async () => {
    db.updateMany.mockResolvedValue({ count: 0 })

    const [out] = await remediateLegacyMpLinks({ apply: true })

    expect(out.applied).toBe(false)
    expect(db.create).not.toHaveBeenCalled()
  })
})
