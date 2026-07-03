import { describe, it, expect, vi, beforeEach } from "vitest"

// PERF-004: o board de leads deixou de carregar TODOS os leads numa query e passou
// a fazer 1 findMany CAPADA por coluna (take PER_STAGE_LIMIT). Este teste prova o
// cap por stage e que o board é particionado corretamente.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    systemSettings: { findUnique: vi.fn() },
    course: { findUnique: vi.fn() },
    studentLead: { findMany: vi.fn() },
  },
}))
vi.mock("@/lib/auth/admin-session", () => ({ requireAdminSession: vi.fn() }))
vi.mock("@/lib/automation/leads", () => ({ reconcileLeadStages: vi.fn() }))

import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { GET } from "./route"

const p = prisma as unknown as {
  systemSettings: { findUnique: ReturnType<typeof vi.fn> }
  course: { findUnique: ReturnType<typeof vi.fn> }
  studentLead: { findMany: ReturnType<typeof vi.fn> }
}
const sessionMock = requireAdminSession as unknown as ReturnType<typeof vi.fn>

function req() {
  return new Request("http://x/api/admin/leads")
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionMock.mockResolvedValue({ role: "SUPER_ADMIN" })
  p.systemSettings.findUnique.mockResolvedValue({ pmbAbandonedAfterHours: 24 })
  // Devolve 1 lead cujo stage espelha o filtro do where (simula partição por coluna).
  p.studentLead.findMany.mockImplementation(async (args: { where: { stage: string } }) => [
    {
      id: `l-${args.where.stage}`,
      nome: "N",
      email: "e",
      telefone: "t",
      courseSnapshot: null,
      stage: args.where.stage,
      source: "s",
      paymentValue: null,
      columnOrder: 0,
      createdAt: new Date("2026-07-03T00:00:00Z"),
    },
  ])
})

describe("admin/leads — cap por coluna (PERF-004)", () => {
  it("faz 1 query por stage com take=200 e particiona o board", async () => {
    const res = await GET(req())
    expect(res.status).toBe(200)
    const json = (await res.json()) as { data: Record<string, unknown[]> }

    // 6 colunas (NEW, CONTACTED, CHECKOUT_STARTED, ABANDONED, WON, LOST).
    expect(p.studentLead.findMany).toHaveBeenCalledTimes(6)
    for (const call of p.studentLead.findMany.mock.calls) {
      expect(call[0].take).toBe(200)
      expect(call[0].where.tenantId).toBeNull()
    }
    // Cada coluna recebeu só o seu lead.
    expect(json.data.NEW).toHaveLength(1)
    expect(json.data.WON[0]).toMatchObject({ stage: "WON" })
    expect(json.data.LOST[0]).toMatchObject({ stage: "LOST" })
  })

  it("papel sem permissão → 403 sem consultar leads", async () => {
    sessionMock.mockResolvedValue({ role: "PMB_RESELLER_MGR" })
    const res = await GET(req())
    expect(res.status).toBe(403)
    expect(p.studentLead.findMany).not.toHaveBeenCalled()
  })
})
