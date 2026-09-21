import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * A pagina de venda do plano mostra uma AMOSTRA dos cursos.
 *
 * O caso caro e a amostra virar o total: um plano "catalogo inteiro" passaria a
 * anunciar "acesso a 12 cursos" na tela em que a pessoa decide pagar.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscriptionPlan: { findMany: vi.fn(), findUnique: vi.fn() },
    tenantSubscriptionPlan: { findMany: vi.fn(), findUnique: vi.fn() },
    coursePackageItem: { findMany: vi.fn(async () => []) },
    course: { count: vi.fn(), findMany: vi.fn() },
    tenant: { findUnique: vi.fn() },
  },
}))
vi.mock("@/lib/catalog/visibility", () => ({ COURSE_HAS_PRICE: {}, COURSE_PROVISIONABLE: {} }))
vi.mock("@/lib/tenant/courses", () => ({ visibilityFilter: () => ({}) }))

import { prisma } from "@/lib/prisma"
import { getVitrinePlanDetail, PLAN_DETAIL_COURSE_PREVIEW } from "./plans"

const findPlans = prisma.subscriptionPlan.findMany as unknown as ReturnType<typeof vi.fn>
const findOne = prisma.subscriptionPlan.findUnique as unknown as ReturnType<typeof vi.fn>
const countCourses = prisma.course.count as unknown as ReturnType<typeof vi.fn>
const findCourses = prisma.course.findMany as unknown as ReturnType<typeof vi.fn>
const findTenant = prisma.tenant.findUnique as unknown as ReturnType<typeof vi.fn>

const PLAN = {
  id: "p1",
  tenantId: null,
  name: "Clube",
  slug: "clube",
  description: null,
  coverImageUrl: null,
  price: 49.9,
  interval: "MONTHLY",
  enabled: true,
  featured: false,
  position: 0,
  scope: "ALL",
  categoryIds: [],
  courseIds: [],
  packageId: null,
}

function course(i: number) {
  return {
    id: `c${i}`,
    nome: `Curso ${i}`,
    slug: `curso-${i}`,
    capaImageUrl: null,
    capaOverride: null,
    cargaHoraria: "40 horas",
    qtdAulas: 10,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  findTenant.mockResolvedValue({ subscriptionsEnabled: true })
  ;(prisma.tenantSubscriptionPlan.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([])
  findPlans.mockResolvedValue([PLAN])
  findOne.mockResolvedValue(PLAN)
})

describe("getVitrinePlanDetail", () => {
  it("a amostra e limitada, mas courseCount continua sendo o TOTAL", async () => {
    countCourses.mockResolvedValue(217)
    findCourses.mockResolvedValue(
      Array.from({ length: PLAN_DETAIL_COURSE_PREVIEW }, (_, i) => course(i)),
    )

    const detail = await getVitrinePlanDetail(null, "clube")

    expect(detail?.courses).toHaveLength(PLAN_DETAIL_COURSE_PREVIEW)
    expect(detail?.courseCount).toBe(217)
    expect(findCourses.mock.calls[0][0].take).toBe(PLAN_DETAIL_COURSE_PREVIEW)
  })

  it("plano nao vendavel nesta vitrine nao vira pagina — e nem consulta cursos", async () => {
    // Plano sem curso liberado: `resolveVitrinePlans` ja o descarta. A pagina
    // de detalhe nao pode ter uma segunda regra que o traga de volta.
    countCourses.mockResolvedValue(0)

    expect(await getVitrinePlanDetail(null, "clube")).toBeNull()
    expect(findCourses).not.toHaveBeenCalled()
  })
})
