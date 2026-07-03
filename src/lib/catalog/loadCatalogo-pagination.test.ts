import { describe, it, expect, vi, beforeEach } from "vitest"

// PERF-003: loadCatalogo passou a aceitar take/skip para paginar o catálogo
// público server-side. Este teste prova o forwarding para o Prisma e que o
// `total` (count) vem separado do page-slice.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    course: { findMany: vi.fn(), count: vi.fn() },
    category: { findUnique: vi.fn() },
  },
}))
vi.mock("@/lib/system-settings", () => ({
  getSystemSettings: vi.fn().mockResolvedValue({ pmbInterestFreeInstallments: 1 }),
}))

import { prisma } from "@/lib/prisma"
import { loadCatalogo } from "./home"

const p = prisma as unknown as {
  course: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> }
  category: { findUnique: ReturnType<typeof vi.fn> }
}

beforeEach(() => {
  vi.clearAllMocks()
  p.course.findMany.mockResolvedValue([])
  p.course.count.mockResolvedValue(50)
})

describe("loadCatalogo — paginação (PERF-003)", () => {
  it("encaminha take e skip ao findMany e retorna o total separado", async () => {
    const res = await loadCatalogo({ take: 24, skip: 24 })

    expect(p.course.findMany).toHaveBeenCalledTimes(1)
    const arg = p.course.findMany.mock.calls[0][0]
    expect(arg.take).toBe(24)
    expect(arg.skip).toBe(24)
    // total vem do count, não do tamanho da página.
    expect(res.total).toBe(50)
  })

  it("sem take/skip não injeta paginação (compat com callers antigos)", async () => {
    await loadCatalogo({})
    const arg = p.course.findMany.mock.calls[0][0]
    expect(arg).not.toHaveProperty("take")
    expect(arg).not.toHaveProperty("skip")
  })

  it("skip=0 não é injetado (0 é falsy — findMany sem offset)", async () => {
    await loadCatalogo({ take: 24, skip: 0 })
    const arg = p.course.findMany.mock.calls[0][0]
    expect(arg.take).toBe(24)
    expect(arg).not.toHaveProperty("skip")
  })
})
