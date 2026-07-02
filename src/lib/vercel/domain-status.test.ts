import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock do client Vercel — controlamos verified (posse) e misconfigured (DNS).
vi.mock("./client", () => ({
  getProjectDomain: vi.fn(),
  getDomainConfig: vi.fn(),
}))

import { getProjectDomain, getDomainConfig } from "./client"
import { resolveCustomDomainStatus } from "./domain-status"

const mockedGetProjectDomain = vi.mocked(getProjectDomain)
const mockedGetDomainConfig = vi.mocked(getDomainConfig)

// Retorna verified/misconfigured por host, permitindo simular apex OK e www não.
function wire(
  byDomain: Record<
    string,
    { verified: boolean; misconfigured: boolean; verification?: unknown[] }
  >,
) {
  mockedGetProjectDomain.mockImplementation(async (d: string) => ({
    name: d,
    verified: byDomain[d].verified,
    verification: (byDomain[d].verification ?? []) as never,
  }))
  mockedGetDomainConfig.mockImplementation(async (d: string) => ({
    misconfigured: byDomain[d].misconfigured,
  }))
}

describe("resolveCustomDomainStatus (os 2 registros apontados)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("ACTIVE só quando apex E www estão verificados E apontados", async () => {
    wire({
      "cliente.com.br": { verified: true, misconfigured: false },
      "www.cliente.com.br": { verified: true, misconfigured: false },
    })
    const r = await resolveCustomDomainStatus("cliente.com.br")
    expect(r.status).toBe("ACTIVE")
    expect(r.pointed).toBe(true)
    expect(r.verification).toBeNull()
  })

  it("PENDING quando só 1 dos 2 registros aponta (www misconfigured)", async () => {
    wire({
      "cliente.com.br": { verified: true, misconfigured: false },
      "www.cliente.com.br": {
        verified: false,
        misconfigured: true,
        verification: [
          { type: "CNAME", domain: "www.cliente.com.br", value: "x", reason: "pending" },
        ],
      },
    })
    const r = await resolveCustomDomainStatus("cliente.com.br")
    expect(r.status).toBe("PENDING")
    expect(r.pointed).toBe(false)
    expect(r.verification).toHaveLength(1)
  })

  it("PENDING quando verificado mas DNS ainda não aponta (misconfigured)", async () => {
    wire({
      "cliente.com.br": { verified: true, misconfigured: true },
      "www.cliente.com.br": { verified: true, misconfigured: true },
    })
    const r = await resolveCustomDomainStatus("cliente.com.br")
    expect(r.pointed).toBe(false)
    expect(r.status).toBe("PENDING")
  })

  it("propaga falha da Vercel (chamador trata como ERROR)", async () => {
    mockedGetProjectDomain.mockRejectedValue(new Error("Vercel API 500"))
    mockedGetDomainConfig.mockResolvedValue({ misconfigured: false })
    await expect(resolveCustomDomainStatus("cliente.com.br")).rejects.toThrow()
  })
})
