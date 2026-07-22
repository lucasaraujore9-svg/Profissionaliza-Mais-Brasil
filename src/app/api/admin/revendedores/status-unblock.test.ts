import { describe, it, expect, vi, beforeEach } from "vitest"

/*
 * Reativar a unidade tem que DEVOLVER o acesso dos alunos bloqueados enquanto
 * ela estava suspensa.
 *
 * Incidente real (21/07/2026, unidade `profissionalizantes`): a unidade ficou
 * suspensa, o auto-block cortou os alunos, o admin reativou na mão pelo painel —
 * e ninguém desbloqueou ninguém. O cron `reactivate-paid` só varre tenants
 * SUSPENDED, então assim que o status virou ACTIVE a unidade saiu do radar dele
 * para sempre. Dois alunos BOLSISTAS (não deviam nada) ficaram sem aula por dias.
 */

const db = vi.hoisted(() => ({
  tenant: { findUnique: vi.fn(), update: vi.fn() },
}))
vi.mock("@/lib/prisma", () => ({ prisma: db }))

const requireAdminSession = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth/admin-session", () => ({ requireAdminSession }))

const unblockTenantStudents = vi.hoisted(() =>
  vi.fn(
    async (): Promise<{
      affectedStudents: number
      affectedEnrollments: number
      errors: string[]
    }> => ({ affectedStudents: 2, affectedEnrollments: 3, errors: [] }),
  ),
)
vi.mock("@/lib/auto-block", () => ({ unblockTenantStudents }))

vi.mock("@/lib/redis/tenant-cache", () => ({ invalidateTenant: vi.fn() }))
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { PATCH } from "@/app/api/admin/revendedores/[id]/status/route"

const params = Promise.resolve({ id: "t1" })

function req(status: string) {
  return new Request("http://x/api/admin/revendedores/t1/status", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAdminSession.mockResolvedValue({
    userId: "u1",
    role: "SUPER_ADMIN",
    email: "admin@pmb.com.br",
  })
  db.tenant.findUnique.mockResolvedValue({
    id: "t1",
    slug: "unidade",
    customDomain: null,
    accountManagerId: null,
    status: "SUSPENDED",
  })
  db.tenant.update.mockResolvedValue({})
})

describe("PATCH /admin/revendedores/[id]/status — reativação", () => {
  it("SUSPENDED → ACTIVE desbloqueia os alunos da unidade", async () => {
    const res = await PATCH(req("ACTIVE"), { params })

    expect(res.status).toBe(200)
    expect(unblockTenantStudents).toHaveBeenCalledWith("t1")
    expect((await res.json()).data.studentsUnblocked).toBe(2)
  })

  it("CANCELLED → ACTIVE também desbloqueia", async () => {
    db.tenant.findUnique.mockResolvedValue({
      id: "t1",
      slug: "unidade",
      customDomain: null,
      accountManagerId: null,
      status: "CANCELLED",
    })

    await PATCH(req("ACTIVE"), { params })

    expect(unblockTenantStudents).toHaveBeenCalledWith("t1")
  })

  it("ACTIVE → ACTIVE não mexe em ninguém (sem transição)", async () => {
    db.tenant.findUnique.mockResolvedValue({
      id: "t1",
      slug: "unidade",
      customDomain: null,
      accountManagerId: null,
      status: "ACTIVE",
    })

    await PATCH(req("ACTIVE"), { params })

    expect(unblockTenantStudents).not.toHaveBeenCalled()
  })

  it("ACTIVE → SUSPENDED não desbloqueia (direção oposta)", async () => {
    db.tenant.findUnique.mockResolvedValue({
      id: "t1",
      slug: "unidade",
      customDomain: null,
      accountManagerId: null,
      status: "ACTIVE",
    })

    await PATCH(req("SUSPENDED"), { params })

    expect(unblockTenantStudents).not.toHaveBeenCalled()
  })

  it("falha parcial no desbloqueio não derruba a reativação", async () => {
    // A unidade PRECISA voltar mesmo que a plataforma de aulas recuse um aluno —
    // manter a loja fora do ar seria pior. O erro fica no log para retomada.
    unblockTenantStudents.mockResolvedValue({
      affectedStudents: 1,
      affectedEnrollments: 1,
      errors: ["aluno x falhou"],
    })

    const res = await PATCH(req("ACTIVE"), { params })

    expect(res.status).toBe(200)
    expect(db.tenant.update).toHaveBeenCalled()
  })
})
