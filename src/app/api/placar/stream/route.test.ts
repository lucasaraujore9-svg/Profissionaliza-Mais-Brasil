import { describe, it, expect, vi, beforeEach } from "vitest"

// OBS-010: a falha do snapshot inicial da stream do placar antes era engolida
// em catch mudo — agora loga placar.stream.init_failed e degrada (envia "error").

const logWarn = vi.fn()
const getSnapshot = vi.fn()
const getActive = vi.fn()

vi.mock("@/lib/placar/snapshot", () => ({
  getPlacarSnapshotCached: () => getSnapshot(),
  getActiveTenantsCached: () => getActive(),
}))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ warn: logWarn, error: vi.fn(), info: vi.fn() }),
}))

import { GET } from "./route"

beforeEach(() => {
  vi.clearAllMocks()
})

async function drain(res: Response): Promise<string> {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let out = ""
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    out += decoder.decode(value)
  }
  return out
}

describe("placar stream — init_failed logado (OBS-010)", () => {
  it("quando o snapshot inicial falha, loga placar.stream.init_failed e envia evento error", async () => {
    getSnapshot.mockRejectedValue(new Error("db down"))
    getActive.mockResolvedValue([])

    const res = await GET()
    const body = await drain(res)

    expect(body).toContain("event: error")
    expect(logWarn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "placar.stream.init_failed", scope: "public" }),
      expect.any(String),
    )
  })
})
