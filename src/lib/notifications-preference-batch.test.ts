import { describe, it, expect, vi, beforeEach } from "vitest"

// PERF-007: o fan-out de notificações (TENANT/ROLE) filtrava preferências in-app
// com 1 findFirst por usuário (N round-trips). filterUserIdsByInAppPreference faz
// UMA findMany e resolve em memória, mantendo o default "true quando ausente".
vi.mock("@/lib/prisma", () => ({
  prisma: { notificationPreference: { findMany: vi.fn() } },
}))
// Corta a árvore de imports pesados de notifications.ts (só testamos o helper).
vi.mock("@/lib/notifications/push-server", () => ({ sendPushToTarget: vi.fn(), sendPushToUsers: vi.fn() }))
vi.mock("@/lib/email/mailer", () => ({ sendEmail: vi.fn() }))
vi.mock("@/lib/email/tenant-brand", () => ({ loadTenantEmailBrand: vi.fn() }))
vi.mock("@/lib/after-response", () => ({ afterResponse: vi.fn() }))
vi.mock("@/lib/logger", () => ({ contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))

import { prisma } from "@/lib/prisma"
import { filterUserIdsByInAppPreference } from "./notifications"

const p = prisma as unknown as {
  notificationPreference: { findMany: ReturnType<typeof vi.fn> }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("filterUserIdsByInAppPreference (PERF-007)", () => {
  it("faz UMA query e exclui só quem tem inApp=false; ausente = habilitado", async () => {
    p.notificationPreference.findMany.mockResolvedValue([
      { userId: "u2", inApp: false },
      { userId: "u3", inApp: true },
    ])

    const out = await filterUserIdsByInAppPreference(["u1", "u2", "u3"], "cat")

    expect(p.notificationPreference.findMany).toHaveBeenCalledTimes(1)
    expect(p.notificationPreference.findMany).toHaveBeenCalledWith({
      where: { userId: { in: ["u1", "u2", "u3"] }, category: "cat" },
      select: { userId: true, inApp: true },
    })
    // u1 ausente => default true; u3 true; u2 false => fora. Ordem preservada.
    expect(out).toEqual(["u1", "u3"])
  })

  it("sem category: retorna todos sem tocar o banco", async () => {
    const out = await filterUserIdsByInAppPreference(["u1", "u2"], undefined)
    expect(out).toEqual(["u1", "u2"])
    expect(p.notificationPreference.findMany).not.toHaveBeenCalled()
  })

  it("lista vazia: retorna [] sem query", async () => {
    const out = await filterUserIdsByInAppPreference([], "cat")
    expect(out).toEqual([])
    expect(p.notificationPreference.findMany).not.toHaveBeenCalled()
  })
})
