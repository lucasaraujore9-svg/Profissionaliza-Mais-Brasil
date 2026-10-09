import { describe, it, expect, vi, beforeEach } from "vitest"

// O banner Acolhe Mais Brasil é uma seção própria (kind="acolhe"): nasce logo
// após "Mais vendidos", ligada, e a partir daí é movida/desativada como as
// outras. Não pode ser removida nem criada em duplicidade.
vi.mock("@/lib/prisma", () => {
  const homeSection = {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  }
  return {
    prisma: {
      homeSection,
      $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
    },
  }
})

import { prisma } from "@/lib/prisma"
import { ensureAcolheSection, reorderScopeToCanonical, validateSectionPayload } from "./sections"
import { createSection, deleteSection } from "./api"

type Fn = ReturnType<typeof vi.fn>
const db = prisma as unknown as {
  homeSection: Record<"findMany" | "findFirst" | "update" | "updateMany" | "create" | "delete", Fn>
}

beforeEach(() => {
  for (const fn of Object.values(db.homeSection)) fn.mockReset()
  db.homeSection.update.mockResolvedValue({})
  db.homeSection.updateMany.mockResolvedValue({ count: 0 })
  db.homeSection.create.mockResolvedValue({})
})

describe("seção Acolhe", () => {
  it("é um kind válido, só marcador", () => {
    expect(validateSectionPayload("acolhe", { title: "x" })).toEqual({
      ok: true,
      kind: "acolhe",
      config: { kind: "acolhe" },
    })
  })

  it("nasce ligada logo após 'Mais vendidos'", async () => {
    db.homeSection.findFirst
      .mockResolvedValueOnce(null) // ainda não há Acolhe no escopo
      .mockResolvedValueOnce({ position: 3 }) // bestsellers

    await ensureAcolheSection("tenant-1")

    expect(db.homeSection.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", position: { gte: 4 } },
      data: { position: { increment: 1 } },
    })
    expect(db.homeSection.create).toHaveBeenCalledWith({
      data: {
        tenantId: "tenant-1",
        position: 4,
        kind: "acolhe",
        enabled: true,
        config: { kind: "acolhe" },
      },
    })
  })

  it("não recria quando já existe (respeita posição e desativação da unidade)", async () => {
    db.homeSection.findFirst.mockResolvedValueOnce({ id: "acolhe-tenant-1" })
    await ensureAcolheSection("tenant-1")
    expect(db.homeSection.create).not.toHaveBeenCalled()
    expect(db.homeSection.updateMany).not.toHaveBeenCalled()
  })

  it("fica logo após 'Mais vendidos' na ordem canônica", async () => {
    db.homeSection.findMany
      .mockResolvedValueOnce([]) // ids canônicos de categoria
      .mockResolvedValueOnce([
        { id: "acolhe", kind: "acolhe", config: {}, position: 0 },
        { id: "pkg", kind: "packages", config: {}, position: 1 },
        { id: "best", kind: "bestsellers", config: {}, position: 2 },
      ])

    await reorderScopeToCanonical(null)

    const finalPos = new Map(
      db.homeSection.update.mock.calls.map(([arg]) => [arg.where.id, arg.data.position]),
    )
    expect(["best", "acolhe", "pkg"].map((id) => finalPos.get(id))).toEqual([0, 1, 2])
  })

  it("não pode ser removida", async () => {
    db.homeSection.findFirst.mockResolvedValueOnce({ id: "a", kind: "acolhe" })
    const res = await deleteSection({ tenantId: "tenant-1" }, "a")
    expect(res.status).toBe(400)
    expect(db.homeSection.delete).not.toHaveBeenCalled()
  })

  it("não pode ser criada em duplicidade", async () => {
    db.homeSection.findFirst.mockResolvedValueOnce({ id: "a" })
    const res = await createSection({ tenantId: null }, { kind: "acolhe", config: {} })
    expect(res.status).toBe(409)
    expect(db.homeSection.create).not.toHaveBeenCalled()
  })
})
