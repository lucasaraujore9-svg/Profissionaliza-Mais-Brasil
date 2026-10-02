import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/api-parceiros/gate", () => ({ autenticarParceiro: vi.fn() }))
vi.mock("@/lib/resellers/create", () => ({ createReseller: vi.fn() }))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { autenticarParceiro } from "@/lib/api-parceiros/gate"
import { createReseller } from "@/lib/resellers/create"
import { POST } from "./route"

const auth = vi.mocked(autenticarParceiro)
const create = vi.mocked(createReseller)

const BODY = {
  nome: "Cursos do João",
  plano: "pro",
  titular: { nome: "João", email: "JOAO@exemplo.com.br", cpfCnpj: "52998224725" },
}

function post(body: unknown) {
  return POST(
    new Request("http://x/api/v1/unidades", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  )
}

const OK_RESULT = {
  ok: true as const,
  tenant: { id: "t1", slug: "cursos-do-joao", name: "Cursos do João", status: "PENDING" },
  owner: { id: "u1", email: "joao@exemplo.com.br" },
  tempPassword: null,
  vitrineUrl: "https://cursos-do-joao.livrecursos.com.br",
  asaas: {
    configured: true, customerId: "cus_1", subscriptionId: "sub_1", promoSubscriptionId: null,
    free: false, invoiceUrl: "https://asaas/i/1", firstPaymentId: "pay_1", error: null,
  },
  email: { configured: true, sent: true, error: null },
}

beforeEach(() => {
  auth.mockReset()
  create.mockReset()
  auth.mockResolvedValue({ ok: true, key: { id: "k1", name: "n8n", prefix: "pmb_live_abc", scopes: ["unidades.create"] } })
})

describe("POST /api/v1/unidades", () => {
  it("exige o escopo unidades.create e não cria nada sem chave", async () => {
    auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) })
    const res = await post(BODY)
    expect(res.status).toBe(401)
    expect(auth.mock.calls[0][1]).toBe("unidades.create")
    expect(create).not.toHaveBeenCalled()
  })

  it("cria no plano de tabela, slug derivado do nome, e devolve o link da NOSSA página", async () => {
    create.mockResolvedValue(OK_RESULT)
    const res = await post(BODY)
    expect(res.status).toBe(201)

    const input = create.mock.calls[0][0]
    expect(input.slug).toBe("cursos-do-joao")
    expect(input.planValue).toBe(239)
    expect(input.automationEnabled).toBe(true)
    expect(input.ownerEmail).toBe("joao@exemplo.com.br")
    expect(input.actor).toEqual({ userId: null, role: "API_KEY", email: "api:pmb_live_abc" })

    const body = await res.json()
    expect(body.data.pagamento.url).toMatch(/\/cobranca\/pay_1$/)
    expect(body.data.pagamento.valor).toBe(239)
    // Checkout transparente do PMB: a fatura hospedada do Asaas nunca sai.
    expect(JSON.stringify(body)).not.toContain("asaas/i/1")
  })

  it("plano fora da tabela é recusado (sem cortesia nem valor livre pela API)", async () => {
    const res = await post({ ...BODY, plano: "gratis", planValue: 0 })
    expect(res.status).toBe(400)
    expect(create).not.toHaveBeenCalled()
  })

  it("e-mail/slug já usado vira 409 CONFLICT", async () => {
    create.mockResolvedValue({ ok: false, status: 409, error: "Já existe" })
    const res = await post(BODY)
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe("CONFLICT")
  })

  it("Asaas falhou: unidade criada, url null e o erro exposto", async () => {
    create.mockResolvedValue({ ...OK_RESULT, asaas: { ...OK_RESULT.asaas, firstPaymentId: null, error: "Asaas fora" } })
    const res = await post(BODY)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.pagamento.url).toBeNull()
    expect(body.data.pagamento.erro).toBe("Asaas fora")
  })
})
