import { describe, it, expect, afterEach } from "vitest"
import { validateAsaasWebhook, parseAsaasWebhookPayload } from "./webhook"

const ORIG = process.env.ASAAS_WEBHOOK_TOKEN
const ORIG_PREV = process.env.ASAAS_WEBHOOK_TOKEN_PREVIOUS
afterEach(() => {
  if (ORIG === undefined) delete process.env.ASAAS_WEBHOOK_TOKEN
  else process.env.ASAAS_WEBHOOK_TOKEN = ORIG
  if (ORIG_PREV === undefined) delete process.env.ASAAS_WEBHOOK_TOKEN_PREVIOUS
  else process.env.ASAAS_WEBHOOK_TOKEN_PREVIOUS = ORIG_PREV
})

describe("validateAsaasWebhook (QA-002)", () => {
  const TOKEN = "tok_super_secreto_123456"

  it("aceita o token correto", () => {
    process.env.ASAAS_WEBHOOK_TOKEN = TOKEN
    expect(validateAsaasWebhook(TOKEN)).toBe(true)
  })
  it("rejeita token errado de mesmo comprimento", () => {
    process.env.ASAAS_WEBHOOK_TOKEN = TOKEN
    expect(validateAsaasWebhook("tok_errado_0000000000000")).toBe(false)
  })
  it("rejeita token de comprimento diferente", () => {
    process.env.ASAAS_WEBHOOK_TOKEN = TOKEN
    expect(validateAsaasWebhook("curto")).toBe(false)
  })
  it("rejeita header ausente", () => {
    process.env.ASAAS_WEBHOOK_TOKEN = TOKEN
    expect(validateAsaasWebhook(null)).toBe(false)
  })
  it("rejeita quando ASAAS_WEBHOOK_TOKEN está ausente (regressão do dev-bypass)", () => {
    delete process.env.ASAAS_WEBHOOK_TOKEN
    expect(validateAsaasWebhook("qualquer")).toBe(false)
  })
})

/*
 * `ASAAS_WEBHOOK_TOKEN` é Secret na Vercel: não dá para ler o valor de volta,
 * então recadastrar o webhook no Asaas obriga a criar um token novo. Com um
 * único token aceito, a troca abre uma janela em que TODA entrega toma 401 —
 * inclusive a que ativa a unidade que acabou de pagar.
 */
describe("rotação de token sem janela de 401", () => {
  const NOVO = "tok_novo_abcdefghijklmno"
  const ANTIGO = "tok_antigo_1234567890xy"

  it("aceita o token novo durante a transição", () => {
    process.env.ASAAS_WEBHOOK_TOKEN = NOVO
    process.env.ASAAS_WEBHOOK_TOKEN_PREVIOUS = ANTIGO
    expect(validateAsaasWebhook(NOVO)).toBe(true)
  })

  it("aceita o token ANTERIOR enquanto o Asaas ainda não trocou", () => {
    process.env.ASAAS_WEBHOOK_TOKEN = NOVO
    process.env.ASAAS_WEBHOOK_TOKEN_PREVIOUS = ANTIGO
    expect(validateAsaasWebhook(ANTIGO)).toBe(true)
  })

  it("volta a recusar o antigo assim que a env de transição sai", () => {
    // É o passo 3 do procedimento: sem ele, o token rotacionado continua
    // valendo para sempre e a rotação não teria servido para nada.
    process.env.ASAAS_WEBHOOK_TOKEN = NOVO
    delete process.env.ASAAS_WEBHOOK_TOKEN_PREVIOUS
    expect(validateAsaasWebhook(ANTIGO)).toBe(false)
  })

  it("env de transição vazia não habilita nada", () => {
    process.env.ASAAS_WEBHOOK_TOKEN = NOVO
    process.env.ASAAS_WEBHOOK_TOKEN_PREVIOUS = ""
    expect(validateAsaasWebhook(ANTIGO)).toBe(false)
    expect(validateAsaasWebhook(NOVO)).toBe(true)
  })

  it("token errado segue recusado com a transição ativa", () => {
    process.env.ASAAS_WEBHOOK_TOKEN = NOVO
    process.env.ASAAS_WEBHOOK_TOKEN_PREVIOUS = ANTIGO
    expect(validateAsaasWebhook("tok_intruso_000000000000")).toBe(false)
  })
})

describe("parseAsaasWebhookPayload (QA-002)", () => {
  it("aceita PAYMENT_RECEIVED válido e preserva campos extras (passthrough)", () => {
    const body = {
      event: "PAYMENT_RECEIVED",
      payment: {
        id: "pay_1",
        value: 209,
        status: "RECEIVED",
        dueDate: "2026-06-20",
        campoNovo: "preservado",
      },
    }
    const out = parseAsaasWebhookPayload(body)
    expect(out.event).toBe("PAYMENT_RECEIVED")
    expect((out.payment as unknown as Record<string, unknown>).campoNovo).toBe(
      "preservado",
    )
  })
  it("aceita evento só com subscription", () => {
    const out = parseAsaasWebhookPayload({
      event: "SUBSCRIPTION_UPDATED",
      subscription: { id: "sub_1" },
    })
    expect(out.event).toBe("SUBSCRIPTION_UPDATED")
  })
  it("rejeita corpo sem payment nem subscription", () => {
    expect(() => parseAsaasWebhookPayload({ event: "PING" })).toThrow()
  })
  it("rejeita payment sem value", () => {
    expect(() =>
      parseAsaasWebhookPayload({
        event: "PAYMENT_RECEIVED",
        payment: { id: "p", status: "RECEIVED", dueDate: "2026-06-20" },
      }),
    ).toThrow()
  })
  it("rejeita corpo não-objeto", () => {
    expect(() => parseAsaasWebhookPayload(null)).toThrow()
  })
})
