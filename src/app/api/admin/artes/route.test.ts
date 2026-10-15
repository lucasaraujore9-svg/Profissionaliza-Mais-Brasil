import { describe, it, expect, vi, beforeEach } from "vitest"

// Arte nova entra no TOPO da lista (position menor que todas): admin e painel
// das revendas listam por position asc, entao a ultima adicionada aparece primeiro.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    marketingArt: { findFirst: vi.fn(), create: vi.fn() },
  },
}))
vi.mock("@/lib/auth/admin-guard", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn(async () => ({ ok: true })),
  rateLimitResponse: vi.fn(),
  RATE_LIMITS: { artesUpload: {} },
}))
vi.mock("@/lib/supabase/storage", () => ({ deleteVitrineAsset: vi.fn() }))
vi.mock("@/lib/artes/admin-upload", async (orig) => ({
  ...(await orig<typeof import("@/lib/artes/admin-upload")>()),
  validateUploadedArtObject: vi.fn(async () => ({ ok: true, width: 1080, height: 1350 })),
  withArtUrls: (a: unknown) => a,
}))

import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/auth/admin-guard"
import { adminGuardFor } from "@/test/admin-ctx"
import { POST } from "./route"

const p = prisma as unknown as {
  marketingArt: {
    findFirst: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
  }
}
const guardMock = requireAdmin as unknown as ReturnType<typeof vi.fn>

function req() {
  return new Request("http://x/api/admin/artes", {
    method: "POST",
    body: JSON.stringify({
      title: "Nova",
      feedPath: "artes/0b9e2c1a-1111-4222-8333-444455556666.png",
    }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  guardMock.mockImplementation(adminGuardFor({ role: "SUPER_ADMIN" }).requireAdmin)
  p.marketingArt.create.mockImplementation(async ({ data }) => ({ id: "a1", ...data }))
})

describe("POST /api/admin/artes — ordem de adicao", () => {
  it("grava a arte nova antes da primeira da lista", async () => {
    p.marketingArt.findFirst.mockResolvedValue({ position: 0 })
    const res = await POST(req())
    expect(res.status).toBe(201)
    expect(p.marketingArt.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { position: "asc" } }),
    )
    expect(p.marketingArt.create.mock.calls[0][0].data.position).toBe(-1)
  })

  it("banco vazio: primeira arte fica em position 0", async () => {
    p.marketingArt.findFirst.mockResolvedValue(null)
    await POST(req())
    expect(p.marketingArt.create.mock.calls[0][0].data.position).toBe(0)
  })
})
