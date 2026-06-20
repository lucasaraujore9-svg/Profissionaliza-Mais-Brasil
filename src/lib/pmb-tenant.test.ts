import { describe, it, expect, vi, beforeEach } from "vitest"
import { Prisma } from "@prisma/client"

vi.mock("@/lib/prisma", () => ({
  prisma: { tenant: { findUnique: vi.fn(), create: vi.fn() } },
}))

import { prisma } from "@/lib/prisma"
import { getOrCreatePmbTenant } from "./pmb-tenant"

const findUnique = prisma.tenant.findUnique as unknown as ReturnType<typeof vi.fn>
const create = prisma.tenant.create as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  findUnique.mockReset()
  create.mockReset()
})

describe("getOrCreatePmbTenant (DB-005 — race-safe)", () => {
  it("retorna o existente sem criar", async () => {
    findUnique.mockResolvedValue({ id: "t1", slug: "__pmb__" })
    expect(await getOrCreatePmbTenant()).toEqual({ id: "t1", slug: "__pmb__" })
    expect(create).not.toHaveBeenCalled()
  })

  it("cria quando não existe", async () => {
    findUnique.mockResolvedValueOnce(null)
    create.mockResolvedValue({ id: "t2", slug: "__pmb__" })
    expect(await getOrCreatePmbTenant()).toEqual({ id: "t2", slug: "__pmb__" })
  })

  it("race: create estoura P2002 → re-busca o vencedor", async () => {
    findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "t3", slug: "__pmb__" })
    create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }),
    )
    expect(await getOrCreatePmbTenant()).toEqual({ id: "t3", slug: "__pmb__" })
  })

  it("re-lança erro que não seja P2002", async () => {
    findUnique.mockResolvedValueOnce(null)
    create.mockRejectedValue(new Error("boom"))
    await expect(getOrCreatePmbTenant()).rejects.toThrow("boom")
  })
})
