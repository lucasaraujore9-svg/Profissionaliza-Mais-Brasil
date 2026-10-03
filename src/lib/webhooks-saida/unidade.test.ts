import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("./dispatch", () => ({ emitWebhookEvent: vi.fn() }))

import { emitWebhookEvent } from "./dispatch"
import { emitUnidadeStatus } from "./unidade"

const emit = vi.mocked(emitWebhookEvent)

beforeEach(() => emit.mockReset())

describe("emitUnidadeStatus", () => {
  it("só emite em transição real", async () => {
    await emitUnidadeStatus("t1", "SUSPENDED", "SUSPENDED", "cron")
    expect(emit).not.toHaveBeenCalled()
  })

  it.each([
    ["ACTIVE", "unidade.ativada"],
    ["SUSPENDED", "unidade.suspensa"],
    ["CANCELLED", "unidade.cancelada"],
  ])("%s vira %s", async (novo, evento) => {
    await emitUnidadeStatus("t1", "PENDING", novo, "admin")
    expect(emit.mock.calls[0]![0]).toBe(evento)
  })

  it("PENDING não tem evento", async () => {
    await emitUnidadeStatus("t1", "ACTIVE", "PENDING", "admin")
    expect(emit).not.toHaveBeenCalled()
  })
})
