import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import proxy from "./proxy"

// OBS-007: quando o Redis/DB estão fora, o proxy faz fail-open (serve a vitrine)
// mas agora deixa rastro Edge-safe (console.warn/error JSON) — antes eram catches
// mudos. Aqui simulamos Redis/DB fora e verificamos os eventos + o fail-open.

const ORIGINAL_ENV = { ...process.env }

function tenantRequest(): NextRequest {
  return new NextRequest("https://loja1.livrecursos.com.br/", {
    headers: { host: "loja1.livrecursos.com.br" },
  })
}

describe("proxy — logging Edge-safe de fail-open (OBS-007)", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example"
    process.env.UPSTASH_REDIS_REST_TOKEN = "tok"
    process.env.INTERNAL_SECRET = "secret"
    process.env.NEXT_PUBLIC_VITRINE_DOMAIN = "livrecursos.com.br"
    // Redis e resolve-tenant fora: toda chamada de rede falha.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")))
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    process.env = { ...ORIGINAL_ENV }
  })

  it("emite proxy.tenant.failopen (Redis fora) e ainda serve a vitrine (rewrite /loja)", async () => {
    const res = await proxy(tenantRequest())

    // Fail-open preservado: reescreve para /loja (não derruba a vitrine).
    expect(res.headers.get("x-middleware-rewrite")).toContain("/loja")

    const warnEvents = warnSpy.mock.calls
      .map((c) => JSON.parse(c[0] as string).event)
    expect(warnEvents).toContain("proxy.tenant.failopen")

    // Payload do log carrega host + slug, sem PII.
    const failopenLine = warnSpy.mock.calls
      .map((c) => JSON.parse(c[0] as string))
      .find((o) => o.event === "proxy.tenant.failopen")
    expect(failopenLine).toMatchObject({
      host: "loja1.livrecursos.com.br",
      slug: "loja1",
      source: "redis",
    })

    // DB fallback também fora → log de erro estruturado.
    const errorEvents = errorSpy.mock.calls
      .map((c) => JSON.parse(c[0] as string).event)
    expect(errorEvents).toContain("proxy.tenant.db_failopen")
  })
})
