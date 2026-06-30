import { describe, it, expect, afterEach } from "vitest"
import { motherAsaasKey } from "./client"

const ORIG = process.env.ASAAS_API_KEY
afterEach(() => {
  if (ORIG === undefined) delete process.env.ASAAS_API_KEY
  else process.env.ASAAS_API_KEY = ORIG
})

describe("motherAsaasKey", () => {
  it("retorna a chave da conta-mãe quando configurada", () => {
    process.env.ASAAS_API_KEY = "asaas_master_key"
    expect(motherAsaasKey()).toBe("asaas_master_key")
  })
  it("lança quando a chave da conta-mãe não está configurada (sem fallback silencioso)", () => {
    delete process.env.ASAAS_API_KEY
    expect(() => motherAsaasKey()).toThrow()
  })
})
