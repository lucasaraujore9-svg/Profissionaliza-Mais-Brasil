import { describe, it, expect } from "vitest"
import { MAX_ATTEMPTS, nextAttemptDelayMs, webhookUrlError } from "./core"

describe("webhookUrlError", () => {
  it("aceita https público", () => {
    expect(webhookUrlError("https://n8n.exemplo.com.br/webhook/pmb")).toBeNull()
    // Domínio que COMEÇA com fc/fd não é IPv6 ULA.
    expect(webhookUrlError("https://fcbarcelona.com/hook")).toBeNull()
  })

  it.each([
    ["http://exemplo.com/hook", "https"],
    ["https://localhost/hook", "interno"],
    ["https://127.0.0.1/hook", "interno"],
    ["https://10.0.0.5/hook", "interno"],
    ["https://192.168.1.10/hook", "interno"],
    ["https://172.20.0.1/hook", "interno"],
    ["https://169.254.169.254/latest/meta-data", "interno"],
    ["https://[::1]/hook", "interno"],
    ["https://[fd00::1]/hook", "interno"],
    ["https://user:senha@exemplo.com/hook", "senha"],
    ["não é url", "inválida"],
  ])("recusa %s", (url, trecho) => {
    expect(webhookUrlError(url)).toMatch(new RegExp(trecho, "i"))
  })
})

describe("backoff", () => {
  it("espera cresce e esgota depois da 7ª tentativa", () => {
    expect(nextAttemptDelayMs(1)).toBe(60_000)
    expect(nextAttemptDelayMs(6)).toBe(24 * 60 * 60_000)
    expect(nextAttemptDelayMs(MAX_ATTEMPTS)).toBeNull()
  })
})
