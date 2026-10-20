import { describe, it, expect, vi, beforeEach } from "vitest"

// O cliente Asaas e a porta unica do cartao: a trava tem de rodar ANTES do
// gateway e a recusa tem de ser contada DEPOIS — em toda chamada com cartao.
const guard = vi.hoisted(() => ({
  assert: vi.fn(async (..._a: unknown[]) => undefined),
  record: vi.fn(async (..._a: unknown[]) => undefined),
}))
vi.mock("@/lib/checkout/card-guard", async () => {
  const real = await vi.importActual<typeof import("@/lib/checkout/card-guard")>(
    "@/lib/checkout/card-guard",
  )
  return {
    ...real,
    assertCardAttemptAllowed: (...a: unknown[]) => guard.assert(...a),
    recordCardRefusal: (...a: unknown[]) => guard.record(...a),
  }
})
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}))

import { AsaasApiError, createPayment, payWithCreditCard } from "./client"
import { CardGuardError } from "@/lib/checkout/card-guard"

const card = { holderName: "X", number: "5555444433331111", expiryMonth: "01", expiryYear: "2030", ccv: "123" }
const holder = {
  name: "X",
  email: "x@x.com",
  cpfCnpj: "11144477735",
  postalCode: "01001000",
  addressNumber: "1",
  phone: "11999999999",
}
const fetchMock = vi.fn()

beforeEach(() => {
  process.env.ASAAS_API_URL = "https://sandbox.asaas.com/api/v3"
  guard.assert.mockReset().mockResolvedValue(undefined)
  guard.record.mockReset().mockResolvedValue(undefined)
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})

describe("asaas client + card guard", () => {
  it("trava recusa ANTES do gateway, como AsaasApiError 400 com a mensagem", async () => {
    guard.assert.mockRejectedValue(new CardGuardError("Use PIX", "account_tripped"))
    const p = payWithCreditCard("pay_1", { creditCard: card, creditCardHolderInfo: holder, remoteIp: "1.1.1.1" }, "k")
    await expect(p).rejects.toBeInstanceOf(AsaasApiError)
    await expect(p).rejects.toMatchObject({ statusCode: 400, message: "Use PIX" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("recusa 4xx do Asaas com cartao conta para o disjuntor", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ code: "x", description: "Cartão recusado" }] }), { status: 400 }),
    )
    await expect(
      createPayment(
        { customer: "cus", billingType: "CREDIT_CARD", value: 89.9, dueDate: "2026-10-20", creditCard: card, creditCardHolderInfo: holder },
        "k",
      ),
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(guard.assert).toHaveBeenCalledWith({ apiKey: "k", cardNumber: card.number, holderCpf: holder.cpfCnpj })
    expect(guard.record).toHaveBeenCalledWith("k")
  })

  it("PIX/boleto nao passam pela trava", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "pay_2" }), { status: 200 }))
    await createPayment({ customer: "cus", billingType: "PIX", value: 10, dueDate: "2026-10-20" }, "k")
    expect(guard.assert).not.toHaveBeenCalled()
    expect(guard.record).not.toHaveBeenCalled()
  })
})
