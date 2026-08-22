import { describe, it, expect, vi, beforeEach } from "vitest"

// SAAS-010: a venda manual do painel deve aplicar o mesmo gate status=ATIVO do
// checkout da vitrine (ec832d0). Curso desativado na origem (status="INATIVO")
// com TenantCourse.isVisible=true não pode ser vendido — 404 "Curso indisponível".
/**
 * Colunas de autoria que a rota passou a selecionar. Curso do catalogo da PMB
 * tem `authorTenantId: null` — e o que faz o gate de rateio ficar de fora.
 */
const SEM_AUTORIA = {
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
    tenant: { findUnique: vi.fn() },
    tenantCourse: { findMany: vi.fn() },
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
  tenantCourse: { findMany: ReturnType<typeof vi.fn> }
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
      // Aluno NOVO precisa da data de nascimento: e ela que diz se ha
      // responsavel financeiro a exigir. Adulto => sem bloco de responsavel.
      nascimento: "1990-01-01",
      tenantCourseIds: ["tc1"],
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
  p.tenantCourse.findMany.mockResolvedValue([
    {
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
        ...SEM_AUTORIA,
      },
    },
  ])
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
    nascimento: null,
    responsavel: null,
    cpfResponsavel: null,
    responsavelEmail: null,
    responsavelFone: null,
    asaasCustomerId: null,
    responsavelAsaasCustomerId: null,
    ...overrides,
  })
}

/** Body de venda para um aluno JÁ EXISTENTE (não passa por upsertStudent). */
function bodyExistingStudent(overrides: Record<string, unknown> = {}) {
  return new Request("http://x/api/painel/vendas", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ studentId: "s1", tenantCourseIds: ["tc1"], ...overrides }),
  })
}

describe("venda direta herda o gateway da unidade", () => {
  it("unidade ASAAS sem MP não é bloqueada com 'Conecte o Mercado Pago'", async () => {
    p.tenant.findUnique.mockResolvedValue(asaasTenant())
    p.tenantCourse.findMany.mockResolvedValue([]) // para no gate seguinte

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

// ── Venda com mais de um curso ──────────────────────────────────────────────
// Uma cobrança só, pela SOMA dos preços: o 1º curso escolhido vira a matrícula
// primária (que carrega o valor) e os demais ficam em `bundleCourseIds`,
// virando satélites no fulfill.
describe("venda direta com vários cursos", () => {
  /** Dois cursos vendáveis da vitrine da unidade, 100 + 250. */
  function mockTwoCourses() {
    p.tenantCourse.findMany.mockResolvedValue([
      {
        id: "tc1",
        price: 100,
        courseId: "c1",
        paymentType: "ONE_TIME",
        course: { id: "c1", nome: "Curso A", slug: "a", monthlyMonthsMain: null, status: "ATIVO" , ...SEM_AUTORIA },
      },
      {
        id: "tc2",
        price: 250,
        courseId: "c2",
        paymentType: "ONE_TIME",
        course: { id: "c2", nome: "Curso B", slug: "b", monthlyMonthsMain: null, status: "ATIVO" , ...SEM_AUTORIA },
      },
    ])
    p.tenantMember.findFirst.mockResolvedValue(null)
    p.enrollment.findFirst.mockResolvedValue(null)
    p.enrollment.create.mockResolvedValue({ id: "e1" })
    p.enrollment.update.mockResolvedValue({ id: "e1" })
  }

  it("cobra a soma e guarda os cursos extras na matrícula primária", async () => {
    mockTwoCourses()
    mockStudent()

    const res = await POST(bodyExistingStudent({ tenantCourseIds: ["tc1", "tc2"] }))
    expect(res.status).toBe(200)
    const created = p.enrollment.create.mock.calls[0][0] as {
      data: {
        courseId: string
        tenantCourseId: string
        originalAmount: number
        finalAmount: number
        bundleCourseIds: string[]
      }
    }
    // 1º curso escolhido = primária; o valor é o total da venda.
    expect(created.data.courseId).toBe("c1")
    expect(created.data.tenantCourseId).toBe("tc1")
    expect(created.data.originalAmount).toBe(350)
    expect(created.data.finalAmount).toBe(350)
    expect(created.data.bundleCourseIds).toEqual(["c2"])
    // Uma matrícula só é criada agora — os satélites nascem no fulfill.
    expect(p.enrollment.create).toHaveBeenCalledTimes(1)
  })

  it("a ordem escolhida define a primária (2º curso primeiro)", async () => {
    mockTwoCourses()
    mockStudent()

    await POST(bodyExistingStudent({ tenantCourseIds: ["tc2", "tc1"] }))
    const created = p.enrollment.create.mock.calls[0][0] as {
      data: { courseId: string; bundleCourseIds: string[] }
    }
    expect(created.data.courseId).toBe("c2")
    expect(created.data.bundleCourseIds).toEqual(["c1"])
  })

  it("desconto manual incide sobre o TOTAL da venda, não sobre o 1º curso", async () => {
    mockTwoCourses()
    mockStudent()

    await POST(
      bodyExistingStudent({ tenantCourseIds: ["tc1", "tc2"], manualDiscountPercent: 10 }),
    )
    const created = p.enrollment.create.mock.calls[0][0] as {
      data: { discountAmount: number; finalAmount: number }
    }
    expect(created.data.discountAmount).toBe(35)
    expect(created.data.finalAmount).toBe(315)
  })

  // Mensalidade é contrato recorrente de UM curso: somá-la ao preço à vista de
  // outros cobraria só o 1º mês pela venda inteira.
  it("curso mensal junto de outro → 400 e nenhuma matrícula", async () => {
    p.tenant.findUnique.mockResolvedValue({
      ...asaasTenant(),
      salesGateway: "MP",
      mpAccessToken: "enc-token",
      mpPublicKey: "pk",
      monthlyAllowed: true,
      monthlyEnabled: true,
    })
    mockTwoCourses()
    p.tenantCourse.findMany.mockResolvedValue([
      {
        id: "tc1",
        price: 100,
        courseId: "c1",
        paymentType: "MONTHLY",
        course: { id: "c1", nome: "Curso A", slug: "a", monthlyMonthsMain: 12, status: "ATIVO" , ...SEM_AUTORIA },
      },
      {
        id: "tc2",
        price: 250,
        courseId: "c2",
        paymentType: "ONE_TIME",
        course: { id: "c2", nome: "Curso B", slug: "b", monthlyMonthsMain: null, status: "ATIVO" , ...SEM_AUTORIA },
      },
    ])
    mockStudent()

    const res = await POST(bodyExistingStudent({ tenantCourseIds: ["tc1", "tc2"] }))
    expect(res.status).toBe(400)
    const json = (await res.json()) as { error: string }
    expect(json.error).toContain("Curso A")
    expect(p.enrollment.create).not.toHaveBeenCalled()
  })

  // A duplicidade tem que olhar TODOS os cursos da venda: cobrar de novo um
  // curso que o aluno já tem só porque ele não era o primeiro da lista seria
  // cobrança indevida.
  it("aluno que já tem um dos cursos → 409 nomeando o curso", async () => {
    mockTwoCourses()
    mockStudent()
    p.enrollment.findFirst.mockResolvedValue({
      id: "e0",
      status: "ACTIVE",
      course: { nome: "Curso B" },
    })

    const res = await POST(bodyExistingStudent({ tenantCourseIds: ["tc1", "tc2"] }))
    expect(res.status).toBe(409)
    const json = (await res.json()) as { error: string }
    expect(json.error).toContain("Curso B")
    expect(p.enrollment.create).not.toHaveBeenCalled()
    // O gate consultou os dois cursos, não só o primário.
    const where = p.enrollment.findFirst.mock.calls[0][0].where as {
      courseId: { in: string[] }
    }
    expect(where.courseId.in.sort()).toEqual(["c1", "c2"])
  })

  it("um curso pedido que não é da vitrine → 404 (nenhuma venda parcial)", async () => {
    mockTwoCourses()
    p.tenantCourse.findMany.mockResolvedValue([
      {
        id: "tc1",
        price: 100,
        courseId: "c1",
        paymentType: "ONE_TIME",
        course: { id: "c1", nome: "Curso A", slug: "a", monthlyMonthsMain: null, status: "ATIVO" , ...SEM_AUTORIA },
      },
    ])
    mockStudent()

    const res = await POST(bodyExistingStudent({ tenantCourseIds: ["tc1", "tc9"] }))
    expect(res.status).toBe(404)
    expect(p.enrollment.create).not.toHaveBeenCalled()
  })
})

describe("SAAS-010 — gate status=ATIVO na venda manual do painel", () => {
  it("curso INATIVO (isVisible=true) → 404 Curso indisponível", async () => {
    p.tenantCourse.findMany.mockResolvedValue([
      {
        id: "tc1",
        price: 100,
        courseId: "c1",
        paymentType: "ONE_TIME",
        course: { id: "c1", nome: "Curso", slug: "curso", monthlyMonthsMain: null, status: "INATIVO" },
      },
    ])
    const res = await POST(body())
    expect(res.status).toBe(404)
    const json = (await res.json()) as { error: string }
    expect(json.error).toBe("Curso indisponível")
  })

  it("TenantCourse ausente → 404 Curso não encontrado (mensagem distinta do gate)", async () => {
    p.tenantCourse.findMany.mockResolvedValue([])
    const res = await POST(body())
    expect(res.status).toBe(404)
    const json = (await res.json()) as { error: string }
    expect(json.error).toBe("Curso não encontrado na sua vitrine")
  })
})

// ── Responsável financeiro (aluno menor) ───────────────────────────────────
// A maior parte das vendas usa a aba "buscar aluno", então o gate que de fato
// segura o problema é o do aluno JÁ EXISTENTE: sem ele a venda passaria com o
// cadastro velho e o certificado sairia no nome errado de novo.

describe("responsável financeiro", () => {
  beforeEach(() => {
    mockSellableCourse()
  })

  it("aluno novo MENOR sem responsável é recusado", async () => {
    const res = await POST(body({ nascimento: "2012-05-10" }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(JSON.stringify(json)).toContain("responsável")
  })

  it("aluno novo menor COM responsável passa do schema", async () => {
    const res = await POST(
      body({
        nascimento: "2012-05-10",
        responsavel: "Maria da Silva",
        responsavelCpf: "390.533.447-05",
        responsavelEmail: "maria@teste.com",
        responsavelFone: "11988887777",
        responsavelParentesco: "mae",
      }),
    )
    // Passa da validação — o que vier depois é o fluxo normal da venda.
    expect(res.status).not.toBe(400)
  })

  it("aluno novo sem data de nascimento é recusado", async () => {
    const res = await POST(body({ nascimento: undefined }))
    expect(res.status).toBe(400)
  })

  it("aluno EXISTENTE menor sem responsável na ficha é recusado", async () => {
    mockStudent({ nascimento: new Date("2012-05-10T00:00:00.000Z") })
    const res = await POST(bodyExistingStudent())
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.code).toBe("GUARDIAN_REQUIRED")
    // A tela precisa do id para abrir a ficha e completar o cadastro.
    expect(json.studentId).toBe("s1")
  })

  it("aluno EXISTENTE menor COM responsável na ficha passa", async () => {
    mockStudent({
      nascimento: new Date("2012-05-10T00:00:00.000Z"),
      responsavel: "Maria da Silva",
      cpfResponsavel: "39053344705",
    })
    const res = await POST(bodyExistingStudent())
    expect(res.status).not.toBe(400)
  })

  it("aluno EXISTENTE sem data de nascimento NÃO é bloqueado (legado)", async () => {
    // 217 dos 230 alunos em produção não têm data. Bloquear seria um apagão.
    mockStudent({ nascimento: null })
    const res = await POST(bodyExistingStudent())
    expect(res.status).not.toBe(400)
  })
})
