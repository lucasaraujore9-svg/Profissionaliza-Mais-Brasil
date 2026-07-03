import { describe, it, expect, vi, beforeEach } from "vitest"

// PERF-006: regenerate-all passou a ser CAPADO por página (take=200) + cursor
// keyset (?afterId). Página cheia devolve nextAfterId; parcial devolve null.
vi.mock("@/lib/prisma", () => ({ prisma: { certificate: { findMany: vi.fn() } } }))
vi.mock("@/lib/auth/admin-session", () => ({ requireAdminSession: vi.fn() }))
vi.mock("@/lib/auth/bearer", () => ({ isCronAuthorized: vi.fn(() => true) }))
vi.mock("@/lib/certificates/generate-pdf", () => ({ generateAndUploadPdf: vi.fn() }))
vi.mock("@/lib/logger", () => ({ contextLogger: () => ({ info: vi.fn() }) }))

import { prisma } from "@/lib/prisma"
import { generateAndUploadPdf } from "@/lib/certificates/generate-pdf"
import { POST } from "./route"

const findMany = (prisma as unknown as { certificate: { findMany: ReturnType<typeof vi.fn> } }).certificate.findMany
const genMock = generateAndUploadPdf as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  genMock.mockResolvedValue(undefined)
})

function req(afterId?: string) {
  const url = afterId
    ? `http://x/api/admin/certificates/regenerate-all?afterId=${afterId}`
    : "http://x/api/admin/certificates/regenerate-all"
  return new Request(url, { method: "POST" })
}

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
