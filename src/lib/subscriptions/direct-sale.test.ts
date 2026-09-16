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
vi.mock("./carne", () => {
  class CarneInputError extends Error {}
  return {
    CarneInputError,
    createSubscriptionCarne: vi.fn(),
    discardSubscriptionCarne: vi.fn(async () => undefined),
  }
})
vi.mock("@/lib/logger", () => {
  const noop = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  return { contextLogger: () => noop, logger: noop }
})

import { createSubscriptionAtGateway } from "./checkout"
import {
  CarneInputError,
  createSubscriptionCarne,
  discardSubscriptionCarne,
} from "./carne"
import { createDirectSubscriptionSale } from "./direct-sale"

const gatewayCall = createSubscriptionAtGateway as unknown as ReturnType<typeof vi.fn>
const carneCall = createSubscriptionCarne as unknown as ReturnType<typeof vi.fn>
const discard = discardSubscriptionCarne as unknown as ReturnType<typeof vi.fn>

/** YYYY-MM-DD daqui a N dias, no dia civil brasileiro (o da validação). */
function inDays(n: number): string {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
  const d = new Date(`${today}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

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

describe("assinatura NO BOLETO (carnê)", () => {
  const checkout = { gateway: "MP" as const, storeUrl: "https://loja.test" }

  beforeEach(() => {
    carneCall.mockResolvedValue({
      count: 12,
      amount: 90,
      firstBoleto: { url: "https://mp/b.pdf", digitableLine: "123" },
    })
  })

  it("gera os boletos com o preço da assinatura (já com o desconto) e devolve o link da loja", async () => {
    const firstDueDate = inDays(7)
    const res = await createDirectSubscriptionSale({
      ...base(),
      checkout,
      discountPercent: 10,
      carne: { count: 12, firstDueDate },
    })

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(db.create.mock.calls[0][0].data.priceAtPurchase).toBe(90)
    expect(carneCall).toHaveBeenCalledWith({
      subscriptionId: "sub_1",
      count: 12,
      firstDueDate: new Date(`${firstDueDate}T12:00:00.000Z`),
    })
    expect(res.carne).toEqual({
      count: 12,
      amount: 90,
      firstDueDate,
      firstBoleto: { url: "https://mp/b.pdf", digitableLine: "123" },
    })
    expect(res.paymentUrl).toBe("https://loja.test/pagar/assinatura/sub_1")
    // Nada de recorrência no gateway: quem emite é a plataforma.
    expect(gatewayCall).not.toHaveBeenCalled()
  })

  it("pedido inválido é recusado ANTES de criar a assinatura", async () => {
    const res = await createDirectSubscriptionSale({
      ...base(),
      checkout,
      carne: { count: 12, firstDueDate: inDays(-1) },
    })
    expect(res).toMatchObject({ ok: false, status: 400, code: "CARNE_INVALID" })
    expect(db.create).not.toHaveBeenCalled()
    expect(carneCall).not.toHaveBeenCalled()
  })

  it("plano vitalício não vira carnê", async () => {
    const res = await createDirectSubscriptionSale({
      ...base(),
      plan: { ...plan, interval: "LIFETIME" as const },
      checkout,
      carne: { count: 1, firstDueDate: inDays(3) },
    })
    expect(res).toMatchObject({ ok: false, status: 400 })
    expect(db.create).not.toHaveBeenCalled()
  })

  it("cadastro que o boleto não aceita desfaz a venda e explica o porquê", async () => {
    carneCall.mockRejectedValueOnce(new CarneInputError("Informe o endereço completo do aluno"))
    const res = await createDirectSubscriptionSale({
      ...base(),
      checkout,
      carne: { count: 12, firstDueDate: inDays(7) },
    })
    expect(res).toMatchObject({ ok: false, status: 400, error: "Informe o endereço completo do aluno" })
    // Sem desfazer, a linha PENDING travaria a próxima tentativa com 409.
    expect(discard).toHaveBeenCalledWith("sub_1")
  })

  it("gateway fora do ar desfaz a venda com 502", async () => {
    carneCall.mockRejectedValueOnce(new Error("MP 503"))
    const res = await createDirectSubscriptionSale({
      ...base(),
      checkout,
      carne: { count: 12, firstDueDate: inDays(7) },
    })
    expect(res).toMatchObject({ ok: false, status: 502, code: "CARNE_FAILED" })
    expect(discard).toHaveBeenCalledWith("sub_1")
  })

  it("sem carnê nada muda: não emite boleto nenhum", async () => {
    await createDirectSubscriptionSale({ ...base(), checkout })
    expect(carneCall).not.toHaveBeenCalled()
  })
})
