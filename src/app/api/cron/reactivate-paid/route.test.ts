import { describe, it, expect, vi, beforeEach } from "vitest"

// OBS-003: o cron passou a logar `cron.reactivate_paid.done` e, em falha parcial,
// `cron.reactivate_paid.partial` + notificação SUPER_ADMIN (category "cron").

const logInfo = vi.fn()
const logError = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: { findMany: vi.fn(), update: vi.fn() },
    enrollment: { findMany: vi.fn(), update: vi.fn() },
  },
}))
vi.mock("@/lib/auto-block", () => ({ unblockTenantStudents: vi.fn() }))
vi.mock("@/lib/students/plataforma-actions", () => ({ unblockStudentInEA: vi.fn() }))
vi.mock("@/lib/students/reactivation-guard", () => ({
  canReactivateUnderTenant: vi.fn(() => true),
}))
vi.mock("@/lib/tenant/cache-invalidation", () => ({ invalidateTenantCache: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn(() => Promise.resolve(null)) }))
vi.mock("@/lib/auth/bearer", () => ({ isCronAuthorized: vi.fn(() => true) }))
vi.mock("@/lib/pmb-config", () => ({ PMB_TENANT_SLUG: "__pmb__" }))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: logInfo, error: logError }),
}))

import { prisma } from "@/lib/prisma"
import { createNotification } from "@/lib/notifications"
import { POST } from "./route"

const tenantFindMany = (prisma as unknown as { tenant: { findMany: ReturnType<typeof vi.fn> } }).tenant.findMany
const tenantUpdate = (prisma as unknown as { tenant: { update: ReturnType<typeof vi.fn> } }).tenant.update
const enrollmentFindMany = (prisma as unknown as { enrollment: { findMany: ReturnType<typeof vi.fn> } }).enrollment.findMany
const notifyMock = createNotification as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
})

function req() {
  return new Request("http://x/api/cron/reactivate-paid", { method: "POST" })
}

describe("reactivate-paid — logging e alerta (OBS-003)", () => {
  it("em sucesso total, loga *.done e NÃO notifica SUPER_ADMIN", async () => {
    tenantFindMany.mockResolvedValue([])
    enrollmentFindMany.mockResolvedValue([])

    await POST(req())

    expect(logInfo).toHaveBeenCalledWith(
      expect.objectContaining({ event: "cron.reactivate_paid.done", errorCount: 0 }),
      expect.any(String),
    )
    expect(logError).not.toHaveBeenCalled()
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it("em falha parcial, loga *.partial e notifica SUPER_ADMIN (category cron)", async () => {
    tenantFindMany.mockResolvedValue([{ id: "t1", billingMode: "AUTO" }])
    tenantUpdate.mockRejectedValue(new Error("db down"))
    enrollmentFindMany.mockResolvedValue([])

    await POST(req())

    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ event: "cron.reactivate_paid.partial", errorCount: 1 }),
      expect.any(String),
    )
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        audience: "ROLE",
        roleTarget: "SUPER_ADMIN",
        level: "ERROR",
        category: "cron",
      }),
    )
  })
})
