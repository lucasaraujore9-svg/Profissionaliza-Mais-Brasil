import { describe, it, expect, afterEach } from "vitest"
import { mpWebhookUrl, asaasWebhookUrl, webhookBaseUrl } from "./urls"

const ORIG_URL = process.env.NEXT_PUBLIC_APP_URL
const ORIG_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN

afterEach(() => {
  // Atribuir `undefined` a process.env coage para a string "undefined";
  // restaurar corretamente exige delete quando a original era unset.
  if (ORIG_URL === undefined) delete process.env.NEXT_PUBLIC_APP_URL
  else process.env.NEXT_PUBLIC_APP_URL = ORIG_URL
  if (ORIG_DOMAIN === undefined) delete process.env.NEXT_PUBLIC_APP_DOMAIN
  else process.env.NEXT_PUBLIC_APP_DOMAIN = ORIG_DOMAIN
})

describe("webhook URLs (API-001)", () => {
  it("força host www quando configurado o apex (MP/Asaas não seguem 307)", () => {
    process.env.NEXT_PUBLIC_APP_DOMAIN = "profissionalizamaisbrasil.com.br"
    process.env.NEXT_PUBLIC_APP_URL = "https://profissionalizamaisbrasil.com.br"
    expect(webhookBaseUrl()).toBe("https://www.profissionalizamaisbrasil.com.br")
    expect(mpWebhookUrl()).toBe(
      "https://www.profissionalizamaisbrasil.com.br/api/webhooks/mercadopago",
    )
  })

  it("mpWebhookUrl nunca é vazio e tem o path correto (sem tenant)", () => {
    process.env.NEXT_PUBLIC_APP_DOMAIN = "profissionalizamaisbrasil.com.br"
    process.env.NEXT_PUBLIC_APP_URL = "https://www.profissionalizamaisbrasil.com.br"
    expect(mpWebhookUrl()).toMatch(/^https?:\/\/.+\/api\/webhooks\/mercadopago$/)
  })

  it("anexa ?tenant=<slug> quando informado", () => {
    process.env.NEXT_PUBLIC_APP_DOMAIN = "profissionalizamaisbrasil.com.br"
    process.env.NEXT_PUBLIC_APP_URL = "https://www.profissionalizamaisbrasil.com.br"
    expect(mpWebhookUrl("loja1")).toBe(
      "https://www.profissionalizamaisbrasil.com.br/api/webhooks/mercadopago?tenant=loja1",
    )
    expect(asaasWebhookUrl("loja1")).toBe(
      "https://www.profissionalizamaisbrasil.com.br/api/webhooks/asaas?tenant=loja1",
    )
  })
})
