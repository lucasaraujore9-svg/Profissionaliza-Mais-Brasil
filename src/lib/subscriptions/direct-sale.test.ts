import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Venda direta de assinatura: ONDE o aluno paga.
 *
 * O defeito que isto trava (Conecta Educacional, 2026-09-14): a venda direta
 * da UNIDADE criava o preapproval no Mercado Pago e mandava o `init_point` ao
 * aluno — ele saía da loja da revenda para a página do MP, enquanto a venda de
 * curso da mesma tela manda para o checkout transparente da loja. O /admin
 * seguia o mesmo desenho (fatura do Asaas / página do MP) e foi alinhado: a
 * venda direta NUNCA fala com o gateway, em nenhuma das duas portas.
 */

const db = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: { studentSubscription: db },
}))
vi.mock("./checkout", () => ({ createSubscriptionAtGateway: vi.fn() }))
vi.mock("@/lib/logger", () => {
  const noop = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  return { contextLogger: () => noop, logger: noop }
})

import { createSubscriptionAtGateway } from "./checkout"
import { createDirectSubscriptionSale } from "./direct-sale"

const gatewayCall = createSubscriptionAtGateway as unknown as ReturnType<typeof vi.fn>

const student = {
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
}

const plan = {
  id: "plan_1",
  name: "Plano",
  slug: "plano",
  price: 100,
  interval: "MONTHLY" as const,
  scope: {} as never,
}

function base() {
  return {
    plan,
    student,
    tenantId: "t1",
    soldByUserId: "u1",
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  db.findFirst.mockResolvedValue(null)
  db.create.mockResolvedValue({ id: "sub_1" })
  db.update.mockResolvedValue({})
  db.delete.mockResolvedValue({})
})

describe("venda direta pela LOJA (/painel)", () => {
  it("devolve a página de pagamento da loja e não fala com o gateway", async () => {
    const res = await createDirectSubscriptionSale({
      ...base(),
      checkout: {
        gateway: "MP",
        storeUrl: "https://conecta.livrecursos.com.br",
      },
    })

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.paymentUrl).toBe(
      "https://conecta.livrecursos.com.br/pagar/assinatura/sub_1",
    )
    expect(res.paymentUrl).not.toContain("mercadopago")
    expect(gatewayCall).not.toHaveBeenCalled()
  })

  it("grava o link da loja na linha (é dali que a lista copia)", async () => {
    await createDirectSubscriptionSale({
      ...base(),
      checkout: {
        gateway: "MP",
        storeUrl: "https://conecta.livrecursos.com.br/",
      },
    })
    expect(db.update).toHaveBeenCalledWith({
      where: { id: "sub_1" },
      data: {
        checkoutUrl: "https://conecta.livrecursos.com.br/pagar/assinatura/sub_1",
      },
    })
  })

  it("congela preço com desconto e periodicidade na linha PENDING", async () => {
    await createDirectSubscriptionSale({
      ...base(),
      plan: { ...plan, interval: "QUARTERLY" as const },
      discountPercent: 10,
      checkout: { gateway: "ASAAS", storeUrl: "https://loja.test" },
    })
    const data = db.create.mock.calls[0][0].data
    expect(data.status).toBe("PENDING")
    expect(data.priceAtPurchase).toBe(90)
    expect(data.interval).toBe("QUARTERLY")
    expect(data.soldByUserId).toBe("u1")
    expect(data.tenantId).toBe("t1")
  })

  it("se não consegue gravar o link, apaga a linha (senão trava a revenda com 409)", async () => {
    db.update.mockRejectedValueOnce(new Error("db down"))
    await expect(
      createDirectSubscriptionSale({
        ...base(),
        checkout: { gateway: "MP", storeUrl: "https://loja.test" },
      }),
    ).rejects.toThrow("db down")
    expect(db.delete).toHaveBeenCalledWith({ where: { id: "sub_1" } })
  })

  it("assinatura já pendente para o aluno continua recusada", async () => {
    db.findFirst.mockResolvedValueOnce({ id: "sub_0", status: "PENDING" })
    const res = await createDirectSubscriptionSale({
      ...base(),
      checkout: { gateway: "MP", storeUrl: "https://loja.test" },
    })
    expect(res.ok).toBe(false)
    expect(db.create).not.toHaveBeenCalled()
  })
})

describe("venda direta da vitrine PMB (/admin)", () => {
  it("devolve a página de pagamento da PMB e não fala com o gateway", async () => {
    const res = await createDirectSubscriptionSale({
      ...base(),
      tenantId: null,
      checkout: { gateway: "ASAAS", storeUrl: "https://www.profissionalizamaisbrasil.com.br" },
    })
    expect(gatewayCall).not.toHaveBeenCalled()
    expect(res.ok && res.paymentUrl).toBe(
      "https://www.profissionalizamaisbrasil.com.br/pagar/assinatura/sub_1",
    )
    expect(db.create.mock.calls[0][0].data.tenantId).toBeNull()
  })
})
