import { describe, it, expect, vi } from "vitest"
import { runInChunks } from "./concurrency"

describe("runInChunks (PERF-013)", () => {
  it("processa todos os itens preservando a ordem dos resultados", async () => {
    const results = await runInChunks([1, 2, 3, 4, 5], 2, async (n) => n * 10)
    expect(results.map((r) => (r.status === "fulfilled" ? r.value : null))).toEqual([
      10, 20, 30, 40, 50,
    ])
  })

  it("limita a concorrência ao tamanho do lote (nunca > size simultâneos)", async () => {
    let inFlight = 0
    let maxInFlight = 0
    await runInChunks(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
    })
    expect(maxInFlight).toBeLessThanOrEqual(3)
  })

  it("uma falha não aborta as demais (allSettled por lote)", async () => {
    const fn = vi.fn(async (n: number) => {
      if (n === 2) throw new Error("boom")
      return n
    })
    const results = await runInChunks([1, 2, 3], 2, fn)
    expect(fn).toHaveBeenCalledTimes(3)
    expect(results[0].status).toBe("fulfilled")
    expect(results[1].status).toBe("rejected")
    expect(results[2].status).toBe("fulfilled")
    expect(results[1].status === "rejected" && String(results[1].reason)).toContain("boom")
  })

  it("size < 1 lança", async () => {
    await expect(runInChunks([1], 0, async (n) => n)).rejects.toThrow()
  })
})
