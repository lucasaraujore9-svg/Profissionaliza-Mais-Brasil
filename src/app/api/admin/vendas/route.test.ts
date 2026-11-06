import { describe, it, expect, vi, beforeEach } from "vitest"

// Venda direta parcelada na vitrine PMB (/admin/vendas): entrada opcional + N
// parcelas iguais. Nada é cobrado na venda — o aluno escolhe o meio em
// /pagar/<id>, no gateway configurado da venda direta (o MP também, agora).

/** Curso do catálogo PMB sem autoria de unidade (sem rateio). */
const SEM_AUTORIA = {
  provider: "EA" as const,
  plataformaCourseId: "267",
  lmsCourseId: null,
  visibilityMode: "ALL" as const,
  allowedTenantIds: [] as string[],
  blockedTenantIds: [] as string[],
  authorTenantId: null,
  authoredStatus: null,
  distribution: "OWN_ONLY" as const,
  pricingMode: "FIXED" as const,
  authorAmount: null,
  sellerCommissionPercent: null,
  platformFeePercent: null,
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    student: { findFirst: vi.fn() },
    course: { findMany: vi.fn() },
    enrollment: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}))
vi.mock("@/lib/auth/admin-guard", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/system-settings", () => ({ getSystemSettings: vi.fn() }))
vi.mock("@/lib/pmb-config", () => ({ pmbMpAccessToken: vi.fn(async () => "tok") }))
vi.mock("@/lib/pmb-tenant", () => ({
  getOrCreatePmbTenant: vi.fn(async () => ({ id: "pmb", slug: "pmb" })),
}))
vi.mock("@/lib/students/access", () => ({ provisionStudentAccess: vi.fn(async () => undefined) }))
vi.mock("@/lib/coupons/sales-cap", () => ({ effectiveSalesCap: vi.fn(async () => 100) }))
vi.mock("@/lib/installments/flex-sale", async (orig) => ({
  ...(await orig<typeof import("@/lib/installments/flex-sale")>()),
  createFlexPlan: vi.fn(),
}))

import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/auth/admin-guard"
import { adminGuardFor } from "@/test/admin-ctx"
import { getSystemSettings } from "@/lib/system-settings"
import { effectiveSalesCap } from "@/lib/coupons/sales-cap"
import { createFlexPlan } from "@/lib/installments/flex-sale"
import { POST } from "./route"

const p = prisma as unknown as {
  student: { findFirst: ReturnType<typeof vi.fn> }
  course: { findMany: ReturnType<typeof vi.fn> }
  enrollment: {
    findFirst: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
    deleteMany: ReturnType<typeof vi.fn>
  }
}
const guardMock = requireAdmin as unknown as ReturnType<typeof vi.fn>
const settings = getSystemSettings as unknown as ReturnType<typeof vi.fn>
const cap = effectiveSalesCap as unknown as ReturnType<typeof vi.fn>
const flex = createFlexPlan as unknown as ReturnType<typeof vi.fn>

const parcelado = { count: 3, installmentValue: 30, downPayment: 10, firstDueDate: "2099-01-10" }

function req(overrides: Record<string, unknown> = {}) {
  return new Request("http://x/api/admin/vendas", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ studentId: "s1", courseIds: ["c1"], parcelado, ...overrides }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.ASAAS_API_URL = "https://asaas.test"
  process.env.ASAAS_API_KEY = "k"
  guardMock.mockImplementation(adminGuardFor({ role: "SUPER_ADMIN" }).requireAdmin)
  settings.mockResolvedValue({ pmbDirectSaleGateway: "ASAAS" })
  cap.mockResolvedValue(100)
  flex.mockResolvedValue({ rows: 4, total: 100 })
  p.student.findFirst.mockResolvedValue({
    id: "s1",
    nome: "Aluno",
    email: "aluno@teste.com",
    cpf: "11144477735",
    fone: "11987654321",
    nascimento: null,
    responsavel: null,
    cpfResponsavel: null,
    responsavelEmail: null,
    responsavelFone: null,
    asaasCustomerId: null,
    responsavelAsaasCustomerId: null,
  })
  p.course.findMany.mockResolvedValue([
    {
      id: "c1",
      nome: "Curso",
      status: "ATIVO",
      precoVitrineMain: 100,
      precoPromocional: null,
      precoOriginal: null,
      paymentTypeMain: "ONE_TIME",
      monthlyMonthsMain: null,
      ...SEM_AUTORIA,
    },
  ])
  p.enrollment.findFirst.mockResolvedValue(null)
  p.enrollment.create.mockResolvedValue({ id: "e1" })
  p.enrollment.update.mockResolvedValue({ id: "e1" })
})

describe("admin: venda direta parcelada", () => {
  it("cria a matrícula BOLETO_INSTALLMENT e o plano com a agenda", async () => {
    const res = await POST(req())
    expect(res.status).toBe(200)
    const created = p.enrollment.create.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(created.data).toMatchObject({
      tenantId: null,
      paymentType: "BOLETO_INSTALLMENT",
      status: "PENDING",
      gateway: "ASAAS",
      originalAmount: 100,
      discountAmount: 0,
      finalAmount: 100,
    })
    expect(p.enrollment.update).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { externalReference: "pmb_enr_e1" },
    })
    const arg = flex.mock.calls[0][0]
    expect(arg.enrollmentId).toBe("e1")
    expect(arg.tenant).toMatchObject({ isPmbVitrine: true })
    expect(arg.schedule).toMatchObject({ count: 3, installmentValue: 30, downPayment: 10 })
    expect(arg.schedule.firstDueDate.toISOString()).toBe("2099-01-10T12:00:00.000Z")
    const json = (await res.json()) as { data: Record<string, unknown> }
    expect(json.data).toMatchObject({
      enrollmentId: "e1",
      studentId: "s1",
      mode: "parcelado",
      finalAmount: 100,
      discountAmount: 0,
      installment: { count: 3, installmentValue: 30, downPayment: 10, total: 100 },
    })
    expect(json.data.paymentUrl).toMatch(/\/pagar\/e1$/)
  })

  it("curso mensal: o preço de referência é o total da vitrine (mensalidade x meses)", async () => {
    p.course.findMany.mockResolvedValue([
      {
        id: "c1",
        nome: "Curso",
        status: "ATIVO",
        precoVitrineMain: 50,
        precoPromocional: null,
        precoOriginal: null,
        paymentTypeMain: "MONTHLY",
        monthlyMonthsMain: 3,
        ...SEM_AUTORIA,
      },
    ])
    const res = await POST(
      req({ parcelado: { count: 3, installmentValue: 50, firstDueDate: "2099-01-10" } }),
    )
    expect(res.status).toBe(200)
    const created = p.enrollment.create.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(created.data).toMatchObject({ originalAmount: 150, discountAmount: 0, finalAmount: 150 })
  })

  it("total abaixo do teto do vendedor → 403 DISCOUNT_CAP, sem matrícula", async () => {
    cap.mockResolvedValue(10)
    const res = await POST(
      req({ parcelado: { count: 2, installmentValue: 40, firstDueDate: "2099-01-10" } }),
    )
    expect(res.status).toBe(403)
    expect(((await res.json()) as { code: string }).code).toBe("DISCOUNT_CAP")
    expect(p.enrollment.create).not.toHaveBeenCalled()
  })

  it("parcela abaixo do piso (R$ 4) → 400", async () => {
    const res = await POST(req({ parcelado: { ...parcelado, installmentValue: 4 } }))
    expect(res.status).toBe(400)
    expect(p.enrollment.create).not.toHaveBeenCalled()
  })

  it("1ª paga fora → createFlexPlan com paidBefore", async () => {
    const res = await POST(req({ primeiraMensalidadeExterna: { paidAt: "2026-01-05" } }))
    expect(res.status).toBe(200)
    expect(flex.mock.calls[0][0].paidBefore.paidAt.toISOString()).toBe("2026-01-05T12:00:00.000Z")
  })

  it("1ª paga fora sem parcelado → 400", async () => {
    const res = await POST(
      req({ parcelado: undefined, primeiraMensalidadeExterna: { paidAt: "2026-01-05" } }),
    )
    expect(res.status).toBe(400)
    expect(p.enrollment.create).not.toHaveBeenCalled()
  })

  it("createFlexPlan lança → matrícula removida e 502", async () => {
    flex.mockRejectedValue(new Error("boom"))
    const res = await POST(req())
    expect(res.status).toBe(502)
    expect(p.enrollment.delete).toHaveBeenCalledWith({ where: { id: "e1" } })
  })

  it("formulário velho: carneCurso → 400 explícito, sem matrícula (não vira à vista)", async () => {
    const res = await POST(
      req({ parcelado: undefined, carneCurso: { amounts: [50, 50], firstDueDate: "2099-01-10" } }),
    )
    expect(res.status).toBe(400)
    const json = (await res.json()) as { fields: Record<string, string[]> }
    expect(json.fields.carneCurso?.[0]).toContain("recarregue")
    expect(p.enrollment.create).not.toHaveBeenCalled()
  })

  it("gateway da venda direta MP → matrícula gateway MP (não força mais o Asaas)", async () => {
    settings.mockResolvedValue({ pmbDirectSaleGateway: "MP" })
    const res = await POST(req())
    expect(res.status).toBe(200)
    const created = p.enrollment.create.mock.calls[0][0] as { data: { gateway: string } }
    expect(created.data.gateway).toBe("MP")
  })

  it("curso mensal sem parcelado → pagamento único pelo total da vitrine", async () => {
    p.course.findMany.mockResolvedValue([
      {
        id: "c1",
        nome: "Curso",
        status: "ATIVO",
        precoVitrineMain: 50,
        precoPromocional: null,
        precoOriginal: null,
        paymentTypeMain: "MONTHLY",
        monthlyMonthsMain: 3,
        ...SEM_AUTORIA,
      },
    ])
    const res = await POST(req({ parcelado: undefined }))
    expect(res.status).toBe(200)
    const created = p.enrollment.create.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(created.data).toMatchObject({
      paymentType: "ONE_TIME",
      finalAmount: 150,
      installmentsTotal: null,
    })
  })
})
