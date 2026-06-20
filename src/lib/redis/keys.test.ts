import { describe, it, expect } from "vitest"
import { tenantBySlugKey, tenantByDomainKey, tenantByIdKey } from "./keys"

// PERF-001: o proxy (Edge, src/proxy.ts) lê a chave LITERALMENTE como
// `tenant:slug:{slug}`. Se este formato mudar sem atualizar o proxy, o cache
// volta a dar 100% de miss (o bug original). Este teste trava o contrato.
describe("tenant cache keys — contrato proxy/cache (PERF-001)", () => {
  it("slug key = 'tenant:slug:{slug}'", () => {
    expect(tenantBySlugKey("loja1")).toBe("tenant:slug:loja1")
  })
  it("domain key = 'tenant:domain:{domain}'", () => {
    expect(tenantByDomainKey("cliente.com.br")).toBe("tenant:domain:cliente.com.br")
  })
  it("id key = 'tenant:id:{id}'", () => {
    expect(tenantByIdKey("ckabc123")).toBe("tenant:id:ckabc123")
  })
})
