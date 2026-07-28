import { describe, it, expect, vi, beforeEach } from "vitest"

// SAAS-010: a venda manual do painel deve aplicar o mesmo gate status=ATIVO do
// checkout da vitrine (ec832d0). Curso desativado na origem (status="INATIVO")
// com TenantCourse.isVisible=true não pode ser vendido — 404 "Curso indisponível".
vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: { findUnique: vi.fn() },
    tenantCourse: { findFirst: vi.fn() },
    tenantMember: { findFirst: vi.fn() },
    student: { findFirst: vi.fn(), update: vi.fn() },
    enrollment: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}))
vi.mock("@/lib/enrollment/fulfill", () => ({
  fulfillScholarshipEnrollment: vi.fn().mockResolvedValue(undefined),
}))
// Rotas de /painel resolvem papel + permissoes via painelContext (consulta
// prisma.user/tenantMember). Mockamos o guard e usamos um contexto coerente
// derivado dos presets reais — ver src/test/painel-ctx.ts.
vi.mock("@/lib/auth/painel-guard", () => ({ requirePainel: vi.fn() }))
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))

import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { painelGuardOk } from "@/test/painel-ctx"
import { auth } from "@/lib/auth"
import { POST } from "./route"

const p = prisma as unknown as {
  tenant: { findUnique: ReturnType<typeof vi.fn> }
  tenantCourse: { findFirst: ReturnType<typeof vi.fn> }
  tenantMember: { findFirst: ReturnType<typeof vi.fn> }
  student: {
    findFirst: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  enrollment: {
    findFirst: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
}
const resellerSession = requirePainel as unknown as ReturnType<typeof vi.fn>
const authMock = auth as unknown as ReturnType<typeof vi.fn>

function body(overrides: Record<string, unknown> = {}) {
  return new Request("http://x/api/painel/vendas", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      nome: "Aluno Teste",
      email: "aluno@teste.com",
      cpf: "111.444.777-35",
      fone: "11987654321",
      tenantCourseId: "tc1",
      ...overrides,
    }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  resellerSession.mockResolvedValue(painelGuardOk({ userId: "u1" }))
  authMock.mockResolvedValue({ user: { id: "u1" } })
  p.tenant.findUnique.mockResolvedValue({
    id: "t1",
    slug: "unidade",
    poloName: "Polo",
    name: "Unidade",
    status: "ACTIVE",
    mpAccessToken: "enc-token",
    mpPublicKey: "pk",
    customDomain: null,
    domainVerified: false,
    plataformaVendedorId: "v1",
    monthlyAllowed: false,
    monthlyEnabled: false,
    monthlyScope: "DIRECT_ONLY",
    salesGateway: "MP",
    asaasConnected: false,
    asaasApiKey: null,
    asaasWebhookToken: null,
  })
})

// ── Gateway da venda direta ────────────────────────────────────────────────
// A venda direta exigia Mercado Pago incondicionalmente e gravava
// `gateway: "MP"` fixo, ignorando o `salesGateway` da unidade: quem migrou para
// o Asaas ou não vendia (503 "Conecte o Mercado Pago") ou — pior, se o token
// antigo do MP continuasse salvo — cobrava na conta MP desativada.

/** Unidade que escolheu o Asaas e está com a conta pronta (sem MP nenhum). */
function asaasTenant(overrides: Record<string, unknown> = {}) {
  return {
    id: "t1",
    slug: "unidade",
    poloName: "Polo",
    name: "Unidade",
    status: "ACTIVE",
    mpAccessToken: null,
    mpPublicKey: null,
    customDomain: null,
    domainVerified: false,
    plataformaVendedorId: "v1",
    monthlyAllowed: false,
    monthlyEnabled: false,
    monthlyScope: "DIRECT_ONLY",
    salesGateway: "ASAAS",
    asaasConnected: true,
    asaasApiKey: "enc-asaas",
    asaasWebhookToken: "enc-wh",
    ...overrides,
  }
}

/** Curso vendável + aluno existente completo + sem matrícula duplicada. */
function mockSellableCourse() {
  p.tenantCourse.findFirst.mockResolvedValue({
    id: "tc1",
    price: 100,
    courseId: "c1",
    paymentType: "ONE_TIME",
    course: {
      id: "c1",
      nome: "Curso",
      slug: "curso",
      monthlyMonthsMain: null,
      status: "ATIVO",
    },
  })
  p.tenantMember.findFirst.mockResolvedValue(null) // owner: cap 100%
  p.enrollment.findFirst.mockResolvedValue(null)
  p.enrollment.create.mockResolvedValue({ id: "e1" })
  p.enrollment.update.mockResolvedValue({ id: "e1" })
}

function mockStudent(overrides: Record<string, unknown> = {}) {
  p.student.findFirst.mockResolvedValue({
    id: "s1",
    nome: "Aluno Teste",
    email: "aluno@teste.com",
    cpf: "11144477735",
    fone: "11987654321",
    ...overrides,
  })
}

/** Body de venda para um aluno JÁ EXISTENTE (não passa por upsertStudent). */
function bodyExistingStudent(overrides: Record<string, unknown> = {}) {
  return new Request("http://x/api/painel/vendas", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ studentId: "s1", tenantCourseId: "tc1", ...overrides }),
  })
}

describe("venda direta herda o gateway da unidade", () => {
  it("unidade ASAAS sem MP não é bloqueada com 'Conecte o Mercado Pago'", async () => {
    p.tenant.findUnique.mockResolvedValue(asaasTenant())
    p.tenantCourse.findFirst.mockResolvedValue(null) // para no gate seguinte

    const res = await POST(body())
    const json = (await res.json()) as { error: string }
    // Passou do gate de gateway: o 503 do MP não aparece mais.
    expect(res.status).toBe(404)
    expect(json.error).toBe("Curso não encontrado na sua vitrine")
  })

  it("matrícula nasce com gateway=ASAAS (o /process roteia por este campo)", async () => {
    p.tenant.findUnique.mockResolvedValue(asaasTenant())
    mockSellableCourse()
    mockStudent()

    const res = await POST(bodyExistingStudent())
    expect(res.status).toBe(200)
    expect(p.enrollment.create).toHaveBeenCalledTimes(1)
    const created = p.enrollment.create.mock.calls[0][0] as {
      data: { gateway: string }
    }
    expect(created.data.gateway).toBe("ASAAS")
  })

  it("unidade MP continua gravando gateway=MP", async () => {
    mockSellableCourse()
    mockStudent()

    const res = await POST(bodyExistingStudent())
    expect(res.status).toBe(200)
    const created = p.enrollment.create.mock.calls[0][0] as {
      data: { gateway: string }
    }
    expect(created.data.gateway).toBe("MP")
  })

  it("unidade ASAAS escolhida mas desconectada → 503 pedindo o Asaas, não o MP", async () => {
    p.tenant.findUnique.mockResolvedValue(
      asaasTenant({ asaasConnected: false }),
    )

    const res = await POST(body())
    expect(res.status).toBe(503)
    const json = (await res.json()) as { error: string }
    expect(json.error).toContain("Asaas")
    expect(json.error).not.toContain("Mercado Pago")
  })

  it("unidade ASAAS sem token de webhook → 503 (o pagamento nunca liquidaria)", async () => {
    p.tenant.findUnique.mockResolvedValue(
      asaasTenant({ asaasWebhookToken: null }),
    )

    const res = await POST(body())
    expect(res.status).toBe(503)
    const json = (await res.json()) as { error: string }
    expect(json.error).toContain("Asaas")
  })

  it("unidade MP sem credenciais → 503 pedindo o Mercado Pago (regressão)", async () => {
    p.tenant.findUnique.mockResolvedValue({
      ...asaasTenant(),
      salesGateway: "MP",
      asaasConnected: false,
      asaasApiKey: null,
      asaasWebhookToken: null,
    })

    const res = await POST(body())
    expect(res.status).toBe(503)
    const json = (await res.json()) as { error: string }
    expect(json.error).toContain("Mercado Pago")
  })

  it("bolsa em unidade ASAAS registra gateway=ASAAS (rótulo honesto no BI)", async () => {
    p.tenant.findUnique.mockResolvedValue(asaasTenant())
    mockSellableCourse()
    mockStudent()
    p.student.update.mockResolvedValue({ id: "s1" })

    const res = await POST(bodyExistingStudent({ bolsista: true }))
    expect(res.status).toBe(200)
    const created = p.enrollment.create.mock.calls[0][0] as {
      data: { gateway: string }
    }
    expect(created.data.gateway).toBe("ASAAS")
  })

  it("aluno existente sem CPF numa unidade ASAAS → 400 antes de criar matrícula", async () => {
    p.tenant.findUnique.mockResolvedValue(asaasTenant())
    mockSellableCourse()
    mockStudent({ cpf: null })

    const res = await POST(bodyExistingStudent())
    expect(res.status).toBe(400)
    const json = (await res.json()) as { error: string }
    expect(json.error).toContain("CPF")
    expect(p.enrollment.create).not.toHaveBeenCalled()
  })
})

describe("SAAS-010 — gate status=ATIVO na venda manual do painel", () => {
  it("curso INATIVO (isVisible=true) → 404 Curso indisponível", async () => {
    p.tenantCourse.findFirst.mockResolvedValue({
      id: "tc1",
      price: 100,
      course: { id: "c1", nome: "Curso", slug: "curso", monthlyMonthsMain: null, status: "INATIVO" },
    })
    const res = await POST(body())
    expect(res.status).toBe(404)
    const json = (await res.json()) as { error: string }
    expect(json.error).toBe("Curso indisponível")
  })

  it("TenantCourse ausente → 404 Curso não encontrado (mensagem distinta do gate)", async () => {
    p.tenantCourse.findFirst.mockResolvedValue(null)
    const res = await POST(body())
    expect(res.status).toBe(404)
    const json = (await res.json()) as { error: string }
    expect(json.error).toBe("Curso não encontrado na sua vitrine")
  })
})
