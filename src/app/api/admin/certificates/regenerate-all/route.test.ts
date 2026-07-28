import { describe, it, expect, vi, beforeEach } from "vitest"

// PERF-006: regenerate-all passou a ser CAPADO por página (take=200) + cursor
// keyset (?afterId). Página cheia devolve nextAfterId; parcial devolve null.
vi.mock("@/lib/prisma", () => ({ prisma: { certificate: { findMany: vi.fn() } } }))
vi.mock("@/lib/auth/admin-guard", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/auth/bearer", () => ({ isCronAuthorized: vi.fn() }))
vi.mock("@/lib/certificates/generate-pdf", () => ({ generateAndUploadPdf: vi.fn() }))
vi.mock("@/lib/logger", () => ({ contextLogger: () => ({ info: vi.fn() }) }))

import { prisma } from "@/lib/prisma"
import { isCronAuthorized } from "@/lib/auth/bearer"
import { requireAdmin } from "@/lib/auth/admin-guard"
import { adminGuardFor } from "@/test/admin-ctx"
import { generateAndUploadPdf } from "@/lib/certificates/generate-pdf"
import { POST } from "./route"

const findMany = (prisma as unknown as { certificate: { findMany: ReturnType<typeof vi.fn> } }).certificate.findMany
const genMock = generateAndUploadPdf as unknown as ReturnType<typeof vi.fn>

const cronMock = isCronAuthorized as unknown as ReturnType<typeof vi.fn>
const guardMock = requireAdmin as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  // Rota aceita CRON_SECRET **ou** sessão com permissão. O padrão aqui é o
  // caminho de sessão: com o cron sempre autorizado, o guard virava código
  // morto e dava para apagá-lo do route.ts sem quebrar teste nenhum.
  cronMock.mockReturnValue(false)
  guardMock.mockImplementation(adminGuardFor({ role: "SUPER_ADMIN" }).requireAdmin)
  genMock.mockResolvedValue(undefined)
})

function req(afterId?: string) {
  const url = afterId
    ? `http://x/api/admin/certificates/regenerate-all?afterId=${afterId}`
    : "http://x/api/admin/certificates/regenerate-all"
  return new Request(url, { method: "POST" })
}

describe("regenerate-all — autorização", () => {
  it("sem CRON_SECRET, exige a permissão de certificados", async () => {
    findMany.mockResolvedValue([])
    guardMock.mockImplementation(
      adminGuardFor({ role: "PMB_DESIGNER" }).requireAdmin,
    )

    const res = await POST(req())
    expect(res.status).toBe(403)
    expect(findMany).not.toHaveBeenCalled()
  })

  it("com CRON_SECRET válido, dispensa a sessão", async () => {
    cronMock.mockReturnValue(true)
    findMany.mockResolvedValue([])

    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(guardMock).not.toHaveBeenCalled()
  })
})

describe("regenerate-all — cursor paginado (PERF-006)", () => {
  it("página cheia (200) devolve nextAfterId = último id e injeta take=200", async () => {
    const certs = Array.from({ length: 200 }, (_, i) => ({ id: `c${String(i).padStart(3, "0")}` }))
    findMany.mockResolvedValue(certs)

    const res = await POST(req())
    const json = (await res.json()) as { count: number; regenerated: number; nextAfterId: string | null }

    expect(findMany.mock.calls[0][0].take).toBe(200)
    expect(findMany.mock.calls[0][0].where.id).toBeUndefined()
    expect(json.count).toBe(200)
    expect(json.regenerated).toBe(200)
    expect(json.nextAfterId).toBe("c199")
    expect(genMock).toHaveBeenCalledTimes(200)
  })

  it("página parcial devolve nextAfterId = null e respeita o cursor afterId", async () => {
    findMany.mockResolvedValue([{ id: "c500" }, { id: "c501" }])

    const res = await POST(req("c499"))
    const json = (await res.json()) as { count: number; nextAfterId: string | null }

    expect(findMany.mock.calls[0][0].where.id).toEqual({ gt: "c499" })
    expect(json.count).toBe(2)
    expect(json.nextAfterId).toBeNull()
  })
})
