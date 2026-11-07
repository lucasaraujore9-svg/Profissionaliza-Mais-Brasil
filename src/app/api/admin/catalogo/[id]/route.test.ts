import { beforeEach, describe, expect, it, vi } from "vitest"

const db = vi.hoisted(() => ({
  course: { findUnique: vi.fn(), update: vi.fn() },
}))
vi.mock("@/lib/prisma", () => ({ prisma: db }))
const requireAdmin = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth/admin-guard", () => ({ requireAdmin }))
vi.mock("@/lib/course-authoring/split-server", () => ({
  validateTenantCoursePrice: vi.fn().mockResolvedValue(null),
}))

import { adminGuardFor } from "@/test/admin-ctx"
import { PATCH } from "./route"

const params = { params: Promise.resolve({ id: "c1" }) }

beforeEach(() => {
  vi.clearAllMocks()
  requireAdmin.mockImplementation(
    adminGuardFor({ userId: "u1", role: "SUPER_ADMIN" }).requireAdmin,
  )
  db.course.update.mockResolvedValue({ id: "c1", precoVitrineMain: 990, precoDeVitrineMain: null })
})

// Curso nao tem mais forma de pagamento nem parcelas proprias (2026-11-06):
// o preco do catalogo e sempre o TOTAL.
describe("PATCH /api/admin/catalogo/[id]", () => {
  it("descarta MONTHLY/meses/parcelas e grava ONE_TIME", async () => {
    const res = await PATCH(
      new Request("http://x/api/admin/catalogo/c1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          precoVitrineMain: 990,
          paymentTypeMain: "MONTHLY",
          monthlyMonthsMain: 12,
          parcelasOverride: 6,
        }),
      }),
      params,
    )
    expect(res.status).toBe(200)
    const data = db.course.update.mock.calls[0][0].data
    expect(data).toMatchObject({
      precoVitrineMain: 990,
      paymentTypeMain: "ONE_TIME",
      monthlyMonthsMain: null,
    })
    expect(data).not.toHaveProperty("parcelasOverride")
  })
})
