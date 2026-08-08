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

const requireAdmin = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth/admin-guard", () => ({ requireAdmin }))

const blockTenantStudents = vi.hoisted(() =>
  vi.fn(
    async (): Promise<{
      affectedStudents: number
      affectedEnrollments: number
      errors: string[]
    }> => ({ affectedStudents: 3, affectedEnrollments: 4, errors: [] }),
  ),
)
const unblockTenantStudents = vi.hoisted(() =>
  vi.fn(
    async (): Promise<{
      affectedStudents: number
      affectedEnrollments: number
      errors: string[]
    }> => ({ affectedStudents: 2, affectedEnrollments: 3, errors: [] }),
  ),
)
vi.mock("@/lib/auto-block", () => ({ blockTenantStudents, unblockTenantStudents }))

vi.mock("@/lib/redis/tenant-cache", () => ({ invalidateTenant: vi.fn() }))
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { PATCH } from "@/app/api/admin/revendedores/[id]/status/route"
import { adminGuardFor } from "@/test/admin-ctx"

const params = Promise.resolve({ id: "t1" })

function req(status: string) {
  return new Request("http://x/api/admin/revendedores/t1/status", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status }),
  })
}

/**
 * `findUnique` atende DUAS leituras nesta rota: a do handler e a de
 * `loadTenantLifecycle`. Por isso o mock carrega `tenantPayments` — uma
 * mensalidade paga, que é o caso destes testes: unidade que era cliente e caiu
 * em inadimplência. Sem nenhuma paga ela cairia na cortesia excepcional e a
 * reativação passa a exigir justificativa (ver `cortesia-excepcional.test.ts`).
 */
function tenantRow(status: string) {
  return {
    id: "t1",
    slug: "unidade",
    customDomain: null,
    accountManagerId: null,
    salesUserId: null,
    status,
    tenantPayments: [{ id: "pago-1" }],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAdmin.mockImplementation(
    adminGuardFor({ userId: "u1", role: "SUPER_ADMIN" }).requireAdmin,
  )
  db.tenant.findUnique.mockResolvedValue(tenantRow("SUSPENDED"))
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
    db.tenant.findUnique.mockResolvedValue(tenantRow("CANCELLED"))

    await PATCH(req("ACTIVE"), { params })

    expect(unblockTenantStudents).toHaveBeenCalledWith("t1")
  })

  it("ACTIVE → ACTIVE não mexe em ninguém (sem transição)", async () => {
    db.tenant.findUnique.mockResolvedValue(tenantRow("ACTIVE"))

    await PATCH(req("ACTIVE"), { params })

    expect(unblockTenantStudents).not.toHaveBeenCalled()
  })

  it("ACTIVE → SUSPENDED não desbloqueia (direção oposta)", async () => {
    db.tenant.findUnique.mockResolvedValue(tenantRow("ACTIVE"))

    await PATCH(req("SUSPENDED"), { params })

    expect(unblockTenantStudents).not.toHaveBeenCalled()
  })
})

describe("PATCH /admin/revendedores/[id]/status — suspensão", () => {
  // O card sempre prometeu "Suspenda ou reative o acesso da unidade", mas a rota
  // só trocava o status: a loja saía do ar e os alunos seguiam assistindo. O
  // admin suspendia acreditando ter cortado o acesso — e não tinha.
  it("ACTIVE → SUSPENDED bloqueia os alunos da unidade", async () => {
    db.tenant.findUnique.mockResolvedValue(tenantRow("ACTIVE"))

    const res = await PATCH(req("SUSPENDED"), { params })

    expect(res.status).toBe(200)
    expect(blockTenantStudents).toHaveBeenCalledWith("t1")
    expect((await res.json()).data.studentsBlocked).toBe(3)
  })

  it("SUSPENDED → SUSPENDED não rebloqueia (sem transição)", async () => {
    db.tenant.findUnique.mockResolvedValue(tenantRow("SUSPENDED"))

    await PATCH(req("SUSPENDED"), { params })

    expect(blockTenantStudents).not.toHaveBeenCalled()
  })

  it("reativar NÃO bloqueia ninguém", async () => {
    await PATCH(req("ACTIVE"), { params })
    expect(blockTenantStudents).not.toHaveBeenCalled()
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
