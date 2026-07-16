import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: vi.fn() },
    tenant: { findUnique: vi.fn() },
  },
}))

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requireArtesManager, requireResellerSeller } from "./guards"

const authMock = auth as unknown as ReturnType<typeof vi.fn>
const userFindFirst = prisma.user.findFirst as unknown as ReturnType<typeof vi.fn>
const tenantFindUnique = prisma.tenant.findUnique as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  authMock.mockReset()
  userFindFirst.mockReset()
  tenantFindUnique.mockReset()
})

function session(user: Record<string, unknown> | null) {
  authMock.mockResolvedValue(user ? { user } : null)
}

describe("requireArtesManager", () => {
  it("libera SUPER_ADMIN e PMB_DESIGNER", async () => {
    for (const role of ["SUPER_ADMIN", "PMB_DESIGNER"] as const) {
      session({ id: "u1", role, tenantId: null })
      const r = await requireArtesManager()
      expect(r.ok).toBe(true)
    }
  })

  it("nega os demais papéis internos e externos", async () => {
    for (const role of [
      "PMB_SALES",
      "PMB_SALES_MGR",
      "PMB_REVENDA_SALES",
      "PMB_RESELLER_MGR",
      "PMB_FINANCEIRO",
      "RESELLER",
      "STUDENT",
    ] as const) {
      session({ id: "u1", role, tenantId: null })
      const r = await requireArtesManager()
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.response.status).toBe(403)
    }
  })

  it("nega sem sessão", async () => {
    session(null)
    const r = await requireArtesManager()
    expect(r.ok).toBe(false)
  })
})

describe("requireResellerSeller", () => {
  it("nega quem não é RESELLER", async () => {
    session({ id: "u1", role: "SUPER_ADMIN", tenantId: null })
    const r = await requireResellerSeller()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.response.status).toBe(403)
  })

  it("nega RESELLER sem tenantId", async () => {
    session({ id: "u1", role: "RESELLER", tenantId: null })
    const r = await requireResellerSeller()
    expect(r.ok).toBe(false)
  })

  it("nega owner quando o módulo está desligado (canSellResellers=false)", async () => {
    session({ id: "u1", role: "RESELLER", tenantId: "t1" })
    userFindFirst.mockResolvedValue({ id: "u1" })
    tenantFindUnique.mockResolvedValue({ canSellResellers: false })
    const r = await requireResellerSeller()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.response.status).toBe(403)
  })

  it("nega consultor (não-owner) mesmo com o módulo ligado", async () => {
    session({ id: "u2", role: "RESELLER", tenantId: "t1" })
    userFindFirst.mockResolvedValue(null) // User.tenantId só é setado p/ owner
    tenantFindUnique.mockResolvedValue({ canSellResellers: true })
    const r = await requireResellerSeller()
    expect(r.ok).toBe(false)
  })

  it("nega unidade não-ACTIVE (ex.: SUSPENDED por inadimplência) mesmo com o módulo ligado", async () => {
    session({ id: "u1", role: "RESELLER", tenantId: "t1" })
    userFindFirst.mockResolvedValue({ id: "u1" })
    tenantFindUnique.mockResolvedValue({ canSellResellers: true, status: "SUSPENDED" })
    const r = await requireResellerSeller()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.response.status).toBe(403)
  })

  it("nega unidade PENDING (sem 1º pagamento) mesmo com o módulo ligado", async () => {
    session({ id: "u1", role: "RESELLER", tenantId: "t1" })
    userFindFirst.mockResolvedValue({ id: "u1" })
    tenantFindUnique.mockResolvedValue({ canSellResellers: true, status: "PENDING" })
    const r = await requireResellerSeller()
    expect(r.ok).toBe(false)
  })

  it("libera owner ACTIVE com o módulo ligado e retorna o tenantId", async () => {
    session({ id: "u1", role: "RESELLER", tenantId: "t1" })
    userFindFirst.mockResolvedValue({ id: "u1" })
    tenantFindUnique.mockResolvedValue({ canSellResellers: true, status: "ACTIVE" })
    const r = await requireResellerSeller()
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.tenantId).toBe("t1")
  })
})
