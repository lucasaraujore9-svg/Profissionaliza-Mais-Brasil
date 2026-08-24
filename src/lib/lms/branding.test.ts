import { describe, expect, it, vi, beforeEach } from "vitest"

/* O que este arquivo protege: `syncTenantBrandingToLms` e chamado de QUATRO
   lugares, e so um deles conhece as cores da unidade. A regra que impede os
   outros tres de APAGAREM a personalizacao e o `?? undefined` — campo ausente
   preserva do lado do LMS, `""` limpa. Um `?? ""` distraido aqui zeraria a
   identidade da unidade toda vez que ela trocasse a logo. */

const putLmsTenantBranding = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock("./client", () => ({ putLmsTenantBranding }))
vi.mock("./config", () => ({ isLmsConfigured: () => true }))
vi.mock("@/lib/pmb-config", () => ({ PMB_TENANT_SLUG: "__pmb__" }))
vi.mock("@/lib/logger", () => {
  const noop = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  return { logger: noop, contextLogger: () => noop }
})

const { syncTenantBrandingToLms } = await import("./branding")

const BASE = { id: "t1", slug: "unidade", name: "Unidade", logoUrl: null }

beforeEach(() => putLmsTenantBranding.mockClear())

describe("identidade da unidade no LMS", () => {
  it("leva as cores quando o chamador as conhece", async () => {
    await syncTenantBrandingToLms({
      ...BASE,
      logoUrl: "https://cdn/logo.png",
      primaryColor: "#2a2f52",
      secondaryColor: "#ffcc2a",
    })
    expect(putLmsTenantBranding).toHaveBeenCalledWith("t1", {
      brandName: "Unidade",
      logoUrl: "https://cdn/logo.png",
      primaryColor: "#2a2f52",
      secondaryColor: "#ffcc2a",
    })
  })

  it("chamador SEM as cores omite o campo — nao manda string vazia", async () => {
    // `""` do lado do LMS LIMPA a cor. Se o upload de logo mandasse `""`, a
    // unidade perderia a identidade ao trocar a propria logo.
    await syncTenantBrandingToLms(BASE)
    const [, body] = putLmsTenantBranding.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(body.primaryColor).toBeUndefined()
    expect(body.secondaryColor).toBeUndefined()
    expect("primaryColor" in body ? body.primaryColor : undefined).toBeUndefined()
  })

  it("null tambem preserva (nao vira string vazia)", async () => {
    await syncTenantBrandingToLms({ ...BASE, primaryColor: null, secondaryColor: null })
    const [, body] = putLmsTenantBranding.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(body.primaryColor).toBeUndefined()
    expect(body.secondaryColor).toBeUndefined()
  })

  it("a vitrine PMB nunca leva marca de revenda", async () => {
    await syncTenantBrandingToLms({ ...BASE, slug: "__pmb__", primaryColor: "#2a2f52" })
    expect(putLmsTenantBranding).not.toHaveBeenCalled()
  })
})
