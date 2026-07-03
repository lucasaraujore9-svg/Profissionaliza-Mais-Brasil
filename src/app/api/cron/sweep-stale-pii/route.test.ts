import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// LGPD-009: mecanismo (gated) de expurgo de PII de captação. Testa o gate de
// auth e os filtros de expurgo (só registros terminais/não convertidos).
vi.mock("@/lib/prisma", () => ({
  prisma: {
    lead: { deleteMany: vi.fn() },
    studentLead: { deleteMany: vi.fn() },
    contactMessage: { deleteMany: vi.fn() },
  },
}))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { prisma } from "@/lib/prisma"
import { POST } from "./route"

const p = prisma as unknown as {
  lead: { deleteMany: ReturnType<typeof vi.fn> }
  studentLead: { deleteMany: ReturnType<typeof vi.fn> }
  contactMessage: { deleteMany: ReturnType<typeof vi.fn> }
}

const OLD_SECRET = process.env.CRON_SECRET

beforeEach(() => {
  p.lead.deleteMany.mockReset()
  p.studentLead.deleteMany.mockReset()
  p.contactMessage.deleteMany.mockReset()
  process.env.CRON_SECRET = "test-secret"
})
afterEach(() => {
  process.env.CRON_SECRET = OLD_SECRET
})

function authed() {
  return new Request("http://x/api/cron/sweep-stale-pii", {
    method: "POST",
    headers: { authorization: "Bearer test-secret" },
  })
}

describe("sweep-stale-pii — mecanismo de retenção (LGPD-009)", () => {
  it("rejeita sem cron secret (401) e NÃO apaga nada", async () => {
    const res = await POST(new Request("http://x/api/cron/sweep-stale-pii", { method: "POST" }))
    expect(res.status).toBe(401)
    expect(p.lead.deleteMany).not.toHaveBeenCalled()
    expect(p.studentLead.deleteMany).not.toHaveBeenCalled()
    expect(p.contactMessage.deleteMany).not.toHaveBeenCalled()
  })

  it("autorizado: expurga só registros terminais/não convertidos e retorna contagens", async () => {
    p.lead.deleteMany.mockResolvedValue({ count: 3 })
    p.studentLead.deleteMany.mockResolvedValue({ count: 5 })
    p.contactMessage.deleteMany.mockResolvedValue({ count: 2 })

    const res = await POST(authed())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.leadsDeleted).toBe(3)
    expect(body.data.studentLeadsDeleted).toBe(5)
    expect(body.data.contactMessagesDeleted).toBe(2)

    // Lead: só não convertidos (tenantId null) e além do prazo.
    const leadWhere = p.lead.deleteMany.mock.calls[0][0].where
    expect(leadWhere.tenantId).toBeNull()
    expect(leadWhere.updatedAt.lt).toBeInstanceOf(Date)

    // StudentLead: só ABANDONED/LOST — nunca WON.
    const slWhere = p.studentLead.deleteMany.mock.calls[0][0].where
    expect(slWhere.stage.in).toEqual(["ABANDONED", "LOST"])
    expect(slWhere.stage.in).not.toContain("WON")

    // ContactMessage: só RESOLVED com resolvedAt além do prazo (não OPEN).
    const cmWhere = p.contactMessage.deleteMany.mock.calls[0][0].where
    expect(cmWhere.status).toBe("RESOLVED")
    expect(cmWhere.resolvedAt.lt).toBeInstanceOf(Date)
  })
})
