import { beforeEach, describe, expect, it, vi } from "vitest"

// Incidente vanguardacursos (2026-07): dominio anexado antes do apontamento →
// Vercel nunca emitiu o cert → https morto. O contrato do helper: por variante
// (apex + www), cert existente = no-op; sem cert + DNS apontado = emite
// single-CN; sem cert + DNS pendente = adia; erro Vercel = failed (nunca lanca).

const listCertsForDomain = vi.fn()
const getDomainConfig = vi.fn()
const issueCert = vi.fn()

vi.mock("./client", () => ({
  listCertsForDomain: (...args: unknown[]) => listCertsForDomain(...args),
  getDomainConfig: (...args: unknown[]) => getDomainConfig(...args),
  issueCert: (...args: unknown[]) => issueCert(...args),
}))

import { ensureCustomDomainCert } from "./ensure-cert"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("ensureCustomDomainCert", () => {
  it("com cert nas duas variantes → ok, sem emissao", async () => {
    listCertsForDomain.mockResolvedValue([{ uid: "cert_1", cns: [] }])

    const result = await ensureCustomDomainCert("escola.com.br")

    expect(result.outcome).toBe("ok")
    expect(issueCert).not.toHaveBeenCalled()
    // Consulta cobre exatamente apex + www.
    expect(listCertsForDomain).toHaveBeenCalledWith("escola.com.br")
    expect(listCertsForDomain).toHaveBeenCalledWith("www.escola.com.br")
  })

  it("sem cert e DNS apontado → emite single-CN por variante (caso vanguarda)", async () => {
    listCertsForDomain.mockResolvedValue([])
    getDomainConfig.mockResolvedValue({ misconfigured: false })
    issueCert.mockResolvedValue({ uid: "cert_new", cns: [] })

    const result = await ensureCustomDomainCert("vanguardacursos.com.br")

    expect(result.outcome).toBe("issued")
    // Single-CN de proposito: multi-SAN falharia inteiro se so uma variante
    // estivesse apontada (http-01 exige cada CN resolvendo).
    expect(issueCert).toHaveBeenCalledWith(["vanguardacursos.com.br"])
    expect(issueCert).toHaveBeenCalledWith(["www.vanguardacursos.com.br"])
  })

  it("sem cert e DNS ainda nao apontado → dns_pending, nao tenta emitir", async () => {
    listCertsForDomain.mockResolvedValue([])
    getDomainConfig.mockResolvedValue({ misconfigured: true })

    const result = await ensureCustomDomainCert("escola.com.br")

    expect(result.outcome).toBe("dns_pending")
    expect(issueCert).not.toHaveBeenCalled()
  })

  it("erro da Vercel em uma variante → failed com detalhe, sem lancar", async () => {
    listCertsForDomain
      .mockResolvedValueOnce([{ uid: "cert_1", cns: [] }])
      .mockRejectedValueOnce(new Error("Vercel API 500"))

    const result = await ensureCustomDomainCert("escola.com.br")

    expect(result.outcome).toBe("failed")
    const failed = result.variants.find((v) => v.action === "failed")
    expect(failed?.detail).toContain("Vercel API 500")
  })

  it("variantes mistas (apex com cert, www apontado sem cert) → issued so no www", async () => {
    listCertsForDomain.mockImplementation(async (host: unknown) =>
      host === "escola.com.br" ? [{ uid: "cert_1", cns: [] }] : [],
    )
    getDomainConfig.mockResolvedValue({ misconfigured: false })
    issueCert.mockResolvedValue({ uid: "cert_new", cns: [] })

    const result = await ensureCustomDomainCert("escola.com.br")

    expect(result.outcome).toBe("issued")
    expect(issueCert).toHaveBeenCalledTimes(1)
    expect(issueCert).toHaveBeenCalledWith(["www.escola.com.br"])
  })
})
