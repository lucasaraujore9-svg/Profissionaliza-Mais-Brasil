import { describe, it, expect, afterEach } from "vitest"
import {
  mpWebhookUrl,
  asaasWebhookUrl,
  webhookBaseUrl,
  activeCustomDomain,
} from "./urls"

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

describe("activeCustomDomain (gate de aplicação do domínio próprio)", () => {
  it("retorna null quando não há domínio próprio", () => {
    expect(activeCustomDomain({ customDomain: null })).toBeNull()
    expect(activeCustomDomain({ customDomain: "   " })).toBeNull()
    expect(activeCustomDomain({})).toBeNull()
  })

  it("retorna null enquanto o domínio está PENDENTE (não verificado)", () => {
    expect(
      activeCustomDomain({ customDomain: "cliente.com.br", domainVerified: false }),
    ).toBeNull()
    // Sem a flag = trata como pendente (fallback seguro para o subdomínio).
    expect(activeCustomDomain({ customDomain: "cliente.com.br" })).toBeNull()
    expect(
      activeCustomDomain({ customDomain: "cliente.com.br", domainVerified: null }),
    ).toBeNull()
  })

  it("aplica o domínio (retorna o host) só quando verificado/apontado", () => {
    expect(
      activeCustomDomain({ customDomain: "cliente.com.br", domainVerified: true }),
    ).toBe("cliente.com.br")
  })

  it("normaliza espaços em volta do domínio aplicado", () => {
    expect(
      activeCustomDomain({ customDomain: "  cliente.com.br  ", domainVerified: true }),
    ).toBe("cliente.com.br")
  })
})
