import { describe, it, expect } from "vitest"
import { extractApiKey, generateApiKey, hashApiKey } from "./keys"
import { sanitizeScopes, isApiScope } from "./scopes"

describe("generateApiKey", () => {
  it("gera segredo com o prefixo público e entropia suficiente", () => {
    const { secret, prefix, keyHash } = generateApiKey()
    expect(secret.startsWith("pmb_live_")).toBe(true)
    // 32 bytes em base64url = 43 chars, mais o prefixo textual.
    expect(secret.length).toBeGreaterThanOrEqual("pmb_live_".length + 43)
    expect(prefix.startsWith("pmb_live_")).toBe(true)
    expect(secret.startsWith(prefix)).toBe(true)
    expect(keyHash).toBe(hashApiKey(secret))
    expect(keyHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it("o prefixo guardado não permite reconstruir o segredo", () => {
    const { secret, prefix } = generateApiKey()
    expect(prefix.length).toBeLessThan(secret.length)
    expect(hashApiKey(prefix)).not.toBe(hashApiKey(secret))
  })

  it("não repete segredo entre chamadas", () => {
    const gerados = new Set(
      Array.from({ length: 50 }, () => generateApiKey().secret),
    )
    expect(gerados.size).toBe(50)
  })
})

describe("extractApiKey", () => {
  function req(headers: Record<string, string>): Request {
    return new Request("https://exemplo.test/api/v1/ping", { headers })
  }

  it("lê do Authorization: Bearer", () => {
    expect(extractApiKey(req({ authorization: "Bearer pmb_live_abc" }))).toBe(
      "pmb_live_abc",
    )
  })

  it("aceita 'bearer' em qualquer caixa", () => {
    expect(extractApiKey(req({ authorization: "bearer pmb_live_abc" }))).toBe(
      "pmb_live_abc",
    )
  })

  it("lê do X-API-Key", () => {
    expect(extractApiKey(req({ "x-api-key": "pmb_live_abc" }))).toBe("pmb_live_abc")
  })

  it("prefere o Authorization quando os dois vêm", () => {
    const r = req({
      authorization: "Bearer pmb_live_do_authorization",
      "x-api-key": "pmb_live_do_header",
    })
    expect(extractApiKey(r)).toBe("pmb_live_do_authorization")
  })

  it("devolve null sem header ou com esquema desconhecido", () => {
    expect(extractApiKey(req({}))).toBeNull()
    expect(extractApiKey(req({ authorization: "Basic dXNlcjpwYXNz" }))).toBeNull()
    expect(extractApiKey(req({ "x-api-key": "   " }))).toBeNull()
  })
})

describe("escopos", () => {
  it("descarta escopo fora do catálogo", () => {
    // Chave gravada com um escopo que depois foi removido não pode virar
    // acesso amplo por acidente.
    expect(sanitizeScopes(["unidades.read", "inventado.total", "*"])).toEqual([
      "unidades.read",
    ])
  })

  it("isApiScope reconhece só o catálogo", () => {
    expect(isApiScope("unidades.read")).toBe(true)
    expect(isApiScope("unidades.write")).toBe(false)
  })
})
