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

// Incidente vanguardacursos (2026-07): custom domain anexado na Vercel mas SEM
// certificado emitido. O self-fetch de resolução usava o origin do request
// (https://{customDomain}) → handshake TLS falhava → fail-open → o site PMB
// inteiro era servido sob o domínio da revenda. O contrato agora: na Vercel o
// fetch de resolução vai SEMPRE para o host canônico www.{appDomain} (cert
// sempre válido), nunca para o custom domain do visitante.
describe("proxy — custom domain resolve via origem canônica (não o próprio host)", () => {
  beforeEach(() => {
    process.env.VERCEL = "1"
    process.env.INTERNAL_SECRET = "secret"
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    process.env = { ...ORIGINAL_ENV }
  })

  it("resolve o tenant pelo host canônico e reescreve a vitrine para /loja", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
      new Response(
        JSON.stringify({ id: "t1", slug: "vanguardacursos", status: "ACTIVE" }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    )
    vi.stubGlobal("fetch", fetchMock)

    const res = await proxy(
      new NextRequest("https://vanguardacursos.com.br/", {
        headers: { host: "vanguardacursos.com.br" },
      }),
    )

    // Nenhuma chamada de resolução pode ter como origem o custom domain do
    // visitante (é exatamente o host cujo TLS pode não existir ainda).
    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls.length).toBeGreaterThan(0)
    for (const url of urls) {
      expect(url).toMatch(
        /^https:\/\/www\.profissionalizamaisbrasil\.com\.br\/api\/internal\/resolve-tenant\?/,
      )
    }

    expect(res.headers.get("x-middleware-rewrite")).toContain("/loja")
    expect(res.headers.get("x-middleware-request-x-tenant-slug")).toBe(
      "vanguardacursos",
    )
  })

  it("*.vercel.app é host interno do app: nem lookup de custom domain, nem 404", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const res = await proxy(
      new NextRequest("https://profissionaliza-mais-brasil.vercel.app/", {
        headers: { host: "profissionaliza-mais-brasil.vercel.app" },
      }),
    )

    expect(res.status).toBe(200)
    expect(res.headers.get("x-middleware-rewrite")).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
