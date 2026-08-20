import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Isolamento financeiro da assinatura vendida por uma UNIDADE.
 *
 * REGRA DE OURO do projeto: toda venda de revenda usa a conta da própria
 * unidade. Enquanto o Asaas caía num `motherAsaasKey()` fixo dentro do
 * checkout, uma assinatura vendida na vitrine de uma revenda seria cobrada na
 * conta da PMB — o mesmo vazamento de receita do incidente de roteamento por
 * sinal negativo. Preferimos LANÇAR e não cobrar a cobrar na conta errada.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: { studentSubscription: { update: vi.fn() } },
}))
vi.mock("@/lib/asaas/client", () => ({
  createSubscription: vi.fn(async () => ({ id: "sub_asaas" })),
  listPayments: vi.fn(async () => ({ data: [{ invoiceUrl: "https://inv" }] })),
  findOrCreateAsaasCustomer: vi.fn(async () => ({
    customer: { id: "cus_1" },
    created: true,
  })),
  motherAsaasKey: () => "MOTHER_KEY",
}))
vi.mock("@/lib/mercadopago/client", () => ({
  createPreapproval: vi.fn(async () => ({ id: "pre_1", status: "authorized" })),
}))
vi.mock("@/lib/tenant/urls", () => ({
  asaasWebhookUrl: (slug?: string) =>
    slug ? `https://pmb.test/api/webhooks/asaas?tenant=${slug}` : "https://pmb.test/api/webhooks/asaas",
  appUrl: () => "https://pmb.test",
}))
vi.mock("@/lib/logger", () => {
  const noop = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  return { contextLogger: () => noop, logger: noop }
})

import {
  createSubscription as createAsaasSubscription,
  findOrCreateAsaasCustomer,
} from "@/lib/asaas/client"
import { createSubscriptionAtGateway } from "./checkout"
import { TenantGatewayIsolationError } from "@/lib/checkout/assert-tenant-gateway"

const createSub = createAsaasSubscription as unknown as ReturnType<typeof vi.fn>
const findCustomer = findOrCreateAsaasCustomer as unknown as ReturnType<typeof vi.fn>

function input(tenantId: string | null) {
  return {
    subscriptionId: "sub_1",
    plan: { id: "p1", name: "Plano", slug: "plano", price: 49.9, scope: {} as never },
    tenantId,
    billingType: "PIX" as const,
    payer: { nome: "Aluno", cpf: "39053344705", email: "a@x.com", phone: null },
  }
}

beforeEach(() => vi.clearAllMocks())

describe("isolamento de conta na assinatura", () => {
  it("venda de UNIDADE usa a chave da unidade, nunca a da PMB", async () => {
    await createSubscriptionAtGateway(input("t1"), "ASAAS", {
      asaasApiKey: "TENANT_KEY",
      tenantSlug: "revenda1",
    })
    // A chave vai no último argumento tanto do customer quanto da subscription.
    expect(findCustomer.mock.calls[0][1]).toBe("TENANT_KEY")
    expect(createSub.mock.calls[0][1]).toBe("TENANT_KEY")
    expect(createSub.mock.calls[0][1]).not.toBe("MOTHER_KEY")
  })

  it("webhook aponta para a conta da unidade (?tenant=slug)", async () => {
    // Sem isto o evento cairia no processador da conta-mãe e a renovação da
    // unidade nunca seria reconhecida.
    await createSubscriptionAtGateway(input("t1"), "ASAAS", {
      asaasApiKey: "TENANT_KEY",
      tenantSlug: "revenda1",
    })
    expect(createSub.mock.calls[0][0].notificationUrl).toContain("tenant=revenda1")
  })

  it("venda de unidade SEM chave propria LANCA em vez de cobrar na conta-mae", async () => {
    // Preferimos não cobrar a cobrar no lugar errado.
    await expect(
      createSubscriptionAtGateway(input("t1"), "ASAAS", { tenantSlug: "revenda1" }),
    ).rejects.toBeInstanceOf(TenantGatewayIsolationError)
    expect(createSub).not.toHaveBeenCalled()
  })

  it("vitrine PMB (tenantId null) pode usar a conta-mae", async () => {
    await createSubscriptionAtGateway(input(null), "ASAAS", {})
    expect(createSub.mock.calls[0][1]).toBe("MOTHER_KEY")
  })

  it("assinatura NUNCA tem fim programado (renova ate cancelar)", async () => {
    // `maxPayments` é o que transforma a assinatura no parcelado mensal que já
    // existia — e que nunca renova.
    await createSubscriptionAtGateway(input(null), "ASAAS", {})
    expect(createSub.mock.calls[0][0]).not.toHaveProperty("maxPayments")
    expect(createSub.mock.calls[0][0].cycle).toBe("MONTHLY")
  })

  it("MP exige o token da unidade", async () => {
    await expect(
      createSubscriptionAtGateway(
        { ...input("t1"), cardToken: "tok_1" },
        "MP",
        { tenantSlug: "revenda1" },
      ),
    ).rejects.toThrow(/Mercado Pago/)
  })
})
