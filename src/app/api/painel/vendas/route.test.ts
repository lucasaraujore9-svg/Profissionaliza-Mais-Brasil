import { describe, it, expect, vi, beforeEach } from "vitest"

// SAAS-010: a venda manual do painel deve aplicar o mesmo gate status=ATIVO do
// checkout da vitrine (ec832d0). Curso desativado na origem (status="INATIVO")
// com TenantCourse.isVisible=true não pode ser vendido — 404 "Curso indisponível".
vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: { findUnique: vi.fn() },
    tenantCourse: { findFirst: vi.fn() },
    tenantMember: { findFirst: vi.fn() },
  },
}))
vi.mock("@/lib/auth/reseller-session", () => ({ requireResellerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))

import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { auth } from "@/lib/auth"
import { POST } from "./route"

const p = prisma as unknown as {
  tenant: { findUnique: ReturnType<typeof vi.fn> }
  tenantCourse: { findFirst: ReturnType<typeof vi.fn> }
  tenantMember: { findFirst: ReturnType<typeof vi.fn> }
}
const resellerSession = requireResellerSession as unknown as ReturnType<typeof vi.fn>
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
  resellerSession.mockResolvedValue({ userId: "u1", tenantId: "t1" })
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
