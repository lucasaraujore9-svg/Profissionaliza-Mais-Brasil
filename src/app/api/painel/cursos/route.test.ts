import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: { findUnique: vi.fn() },
    tenantCourse: { findMany: vi.fn() },
  },
}))
vi.mock("@/lib/auth/painel-guard", () => ({ requirePainel: vi.fn() }))
vi.mock("@/lib/tenant/ensure-courses", () => ({ ensureTenantCourses: vi.fn() }))
vi.mock("@/lib/tenant/checkout-mode", () => ({
  ADVERTISED_INSTALLMENTS_SELECT: {},
  tenantAdvertisedInterestFree: () => 10,
}))

import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { painelGuardOk } from "@/test/painel-ctx"
import { GET } from "./route"

type Fn = ReturnType<typeof vi.fn>
const db = prisma as unknown as {
  tenant: { findUnique: Fn }
  tenantCourse: { findMany: Fn }
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(requirePainel as unknown as Fn).mockResolvedValue(painelGuardOk({ tenantId: "t1" }))
  db.tenant.findUnique.mockResolvedValue({})
})

// Curso nao tem parcelas proprias (2026-11-06): a lista do painel mostra o nº
// da UNIDADE e nao devolve nada por curso, nem com valor legado no banco.
describe("GET /api/painel/cursos", () => {
  it("parcelas = nº da unidade, sem paymentType nem hasCustomParcelas", async () => {
    const now = new Date()
    db.tenantCourse.findMany.mockResolvedValue([
      {
        id: "tc1",
        courseId: "c1",
        price: 300,
        paymentType: "ONE_TIME",
        customParcelas: 3,
        customDescription: null,
        customCapaUrl: null,
        isVisible: true,
        isFeatured: false,
        customOrder: 0,
        createdAt: now,
        updatedAt: now,
        course: { nome: "X", descricao: null, descricaoOverride: null, capaImageUrl: null, capaOverride: null, qtdAulas: 1, cargaHoraria: null },
        _count: { enrollments: 0 },
      },
    ])
    const res = await GET(new Request("http://x/api/painel/cursos"))
    expect(res.status).toBe(200)
    const item = (await res.json()).data[0]
    expect(item.parcelas).toBe(10)
    expect(item).not.toHaveProperty("paymentType")
    expect(item).not.toHaveProperty("hasCustomParcelas")
  })
})
