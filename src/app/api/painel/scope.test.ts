import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Prova que o escopo "só o que é dele" chega às QUERIES — não só ao menu.
 *
 * O vendedor (preset `consultant`, sem nenhum `*.viewAll`) não pode listar nem
 * abrir por ID um aluno/lead que não seja da carteira dele. Antes desta série
 * de mudanças, qualquer membro da unidade via tudo.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    student: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      groupBy: vi.fn(),
      count: vi.fn(),
    },
    studentLead: { findMany: vi.fn(), findFirst: vi.fn() },
    tenant: { findUnique: vi.fn() },
    enrollment: { findMany: vi.fn() },
  },
}))
vi.mock("@/lib/auth/painel-guard", () => ({ requirePainel: vi.fn() }))
// A rota de vendas ainda importa `auth` para outros fins; sem o mock, o
// next-auth real é carregado no ambiente node do vitest.
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/automation/leads", () => ({ reconcileLeadStages: vi.fn() }))
vi.mock("@/lib/automation/assign", () => ({ listLeadAssignees: vi.fn(async () => []) }))

import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { painelGuardOk } from "@/test/painel-ctx"

import { GET as listStudents } from "./alunos/route"
import { GET as getStudent } from "./alunos/[id]/route"
import { GET as listLeads } from "./leads/route"
import { GET as listVendas } from "./vendas/route"

const p = prisma as unknown as {
  student: {
    findMany: ReturnType<typeof vi.fn>
    findFirst: ReturnType<typeof vi.fn>
    groupBy: ReturnType<typeof vi.fn>
    count: ReturnType<typeof vi.fn>
  }
  studentLead: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> }
  tenant: { findUnique: ReturnType<typeof vi.fn> }
  enrollment: { findMany: ReturnType<typeof vi.fn> }
}
const guard = requirePainel as unknown as ReturnType<typeof vi.fn>

const OWN = { some: { soldByUserId: "u1" } }

beforeEach(() => {
  vi.clearAllMocks()
  p.student.findMany.mockResolvedValue([])
  p.student.groupBy.mockResolvedValue([])
  p.student.count.mockResolvedValue(0)
  p.student.findFirst.mockResolvedValue(null)
  p.studentLead.findMany.mockResolvedValue([])
  p.tenant.findUnique.mockResolvedValue({ abandonedAfterHours: 24 })
  p.enrollment.findMany.mockResolvedValue([])
})

describe("alunos — escopo por papel", () => {
  it("vendedor: a listagem filtra pelas matrículas que ele originou", async () => {
    guard.mockResolvedValue(painelGuardOk({ role: "consultant" }))
    await listStudents(new Request("http://x/api/painel/alunos"))

    const where = p.student.findMany.mock.calls[0][0].where
    expect(where.tenantId).toBe("t1")
    // O escopo vai em AND (a chave `enrollments` é usada pelo filtro da tela).
    expect(where.AND).toContainEqual({ enrollments: OWN })
    // As estatísticas do topo da tela contam o mesmo universo.
    expect(p.student.groupBy.mock.calls[0][0].where.enrollments).toEqual(OWN)
    expect(p.student.count.mock.calls[0][0].where.AND).toContainEqual({
      enrollments: OWN,
    })
  })

  it("gerente: vê a unidade inteira", async () => {
    guard.mockResolvedValue(painelGuardOk({ role: "manager" }))
    await listStudents(new Request("http://x/api/painel/alunos"))

    const where = p.student.findMany.mock.calls[0][0].where
    expect(where.tenantId).toBe("t1")
    expect(where.AND).not.toContainEqual({ enrollments: OWN })
  })

  it("vendedor: abrir por ID um aluno fora da carteira dá 404", async () => {
    guard.mockResolvedValue(painelGuardOk({ role: "consultant" }))
    const res = await getStudent(new Request("http://x"), {
      params: Promise.resolve({ id: "s-de-outro" }),
    })

    expect(p.student.findFirst.mock.calls[0][0].where.enrollments).toEqual(OWN)
    expect(res.status).toBe(404)
  })

  it("secretaria: vê todos os alunos", async () => {
    guard.mockResolvedValue(painelGuardOk({ role: "support" }))
    await listStudents(new Request("http://x/api/painel/alunos"))
    expect(p.student.findMany.mock.calls[0][0].where.AND).not.toContainEqual({
      enrollments: OWN,
    })
  })
})

describe("leads — escopo por papel", () => {
  it("vendedor: só os leads atribuídos a ele", async () => {
    guard.mockResolvedValue(painelGuardOk({ role: "consultant" }))
    await listLeads(new Request("http://x/api/painel/leads"))

    for (const call of p.studentLead.findMany.mock.calls) {
      expect(call[0].where.ownerUserId).toBe("u1")
    }
  })

  it("gerente: todos os leads da unidade", async () => {
    guard.mockResolvedValue(painelGuardOk({ role: "manager" }))
    await listLeads(new Request("http://x/api/painel/leads"))

    for (const call of p.studentLead.findMany.mock.calls) {
      expect(call[0].where.ownerUserId).toBeUndefined()
    }
  })
})

describe("vendas — escopo por papel", () => {
  it("vendedor: só as vendas que ele originou", async () => {
    guard.mockResolvedValue(painelGuardOk({ role: "consultant" }))
    await listVendas(new Request("http://x/api/painel/vendas"))
    expect(p.enrollment.findMany.mock.calls[0][0].where.soldByUserId).toBe("u1")
  })

  it("financeiro: todas as vendas diretas da unidade", async () => {
    guard.mockResolvedValue(painelGuardOk({ role: "finance" }))
    await listVendas(new Request("http://x/api/painel/vendas"))
    // `{ not: null }` continua valendo (só vendas diretas), sem travar num autor.
    expect(p.enrollment.findMany.mock.calls[0][0].where.soldByUserId).toEqual({
      not: null,
    })
  })
})
