import { describe, it, expect, vi, beforeEach } from "vitest"

// DB-004: reorderSections/normalizePositions gravam `position` com updates
// SEQUENCIAIS (loop await), NAO com prisma.$transaction([...map]) — o array
// dinamico derrubava o lote inteiro em prod (adapter-pg + pooler). O mock
// abaixo faz $transaction LANCAR para provar que o caminho novo nao o usa.
vi.mock("@/lib/prisma", () => {
  const homeSection = {
    findMany: vi.fn(),
    update: vi.fn(),
  }
  return {
    prisma: {
      __homeSection: homeSection,
      homeSection,
      $transaction: vi.fn(() => {
        throw new Error("$transaction([...]) nao deve ser usado no reorder (DB-004)")
      }),
    },
  }
})

import { prisma } from "@/lib/prisma"
import { reorderSections } from "./api"

const hs = (prisma as unknown as {
  __homeSection: { findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
}).__homeSection

const tx = (prisma as unknown as { $transaction: ReturnType<typeof vi.fn> }).$transaction

beforeEach(() => {
  hs.findMany.mockReset()
  hs.update.mockReset()
  tx.mockClear()
  hs.update.mockResolvedValue({})
})

describe("reorderSections — updates sequenciais (DB-004)", () => {
  it("persiste a nova ordem via update 1-a-1 e NAO usa $transaction([...map])", async () => {
    // 1a findMany: validacao dos ids; 2a findMany: normalizePositions.
    hs.findMany
      .mockResolvedValueOnce([
        { id: "a", kind: "institutional" },
        { id: "b", kind: "institutional" },
        { id: "c", kind: "institutional" },
      ])
      .mockResolvedValueOnce([
        { id: "c", kind: "institutional" },
        { id: "a", kind: "institutional" },
        { id: "b", kind: "institutional" },
      ])

    const res = await reorderSections(
      { tenantId: null },
      { order: ["c", "a", "b"] },
    )

    expect(res.status).toBe(200)
    expect(tx).not.toHaveBeenCalled()

    // reorderSections grava 3 (posicoes 0,1,2 na ordem enviada) e
    // normalizePositions regrava 3 (0..n-1) => 6 updates sequenciais.
    const reorderCalls = hs.update.mock.calls.slice(0, 3)
    expect(reorderCalls).toEqual([
      [{ where: { id: "c" }, data: { position: 0 } }],
      [{ where: { id: "a" }, data: { position: 1 } }],
      [{ where: { id: "b" }, data: { position: 2 } }],
    ])
    expect(hs.update).toHaveBeenCalledTimes(6)
  })

  it("rejeita ids invalidos (findMany devolve menos que o pedido) sem gravar", async () => {
    hs.findMany.mockResolvedValueOnce([{ id: "a", kind: "institutional" }])

    const res = await reorderSections(
      { tenantId: null },
      { order: ["a", "x"] },
    )

    expect(res.status).toBe(400)
    expect(hs.update).not.toHaveBeenCalled()
    expect(tx).not.toHaveBeenCalled()
  })
})
