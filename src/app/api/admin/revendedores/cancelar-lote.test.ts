import { describe, it, expect, vi, beforeEach } from "vitest"

/*
 * Cancelamento em lote das unidades que nunca pagaram.
 *
 * O ponto sensível não é o loop — é a AUTORIZAÇÃO. Os ids que chegam no corpo
 * são um FILTRO sobre o conjunto elegível que o servidor re-deriva, nunca a
 * fonte da verdade. Se a rota confiasse na lista do cliente, um POST forjado
 * cancelaria qualquer unidade da rede sem passar por nenhuma confirmação.
 */

const db = vi.hoisted(() => ({ tenant: { findMany: vi.fn() } }))
vi.mock("@/lib/prisma", () => ({ prisma: db }))

const requireAdmin = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth/admin-guard", () => ({ requireAdmin }))

const logAudit = vi.hoisted(() => vi.fn())
vi.mock("@/lib/audit", () => ({ logAudit }))

const cancelTenant = vi.hoisted(() =>
  vi.fn(async () => ({
    ok: true as const,
    cancelledSubscriptions: 1,
    deletedCharges: 2,
    studentsBlocked: 0,
    warnings: [] as string[],
    before: {
      slug: "u",
      status: "SUSPENDED",
      hadSubscription: true,
      hadPromoSubscription: false,
    },
  })),
)
vi.mock("@/lib/resellers/cancel", async (orig) => {
  const real = (await orig()) as Record<string, unknown>
  return { ...real, cancelTenant }
})

import { POST } from "@/app/api/admin/revendedores/cancelar-lote/route"
import { NEVER_ACTIVATED_WHERE } from "@/lib/tenants/lifecycle"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"
import { adminGuardFor } from "@/test/admin-ctx"

function req(tenantIds: string[]) {
  return new Request("http://x/api/admin/revendedores/cancelar-lote", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tenantIds }),
  })
}

function unidade(id: string) {
  return {
    id,
    slug: id,
    name: `Unidade ${id}`,
    status: "SUSPENDED",
    customDomain: null,
    asaasSubscriptionId: "sub_1",
    asaasPromoSubscriptionId: null,
    cancellationPolicy: null,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAdmin.mockImplementation(
    adminGuardFor({ userId: "u1", role: "SUPER_ADMIN" }).requireAdmin,
  )
  db.tenant.findMany.mockResolvedValue([unidade("a"), unidade("b")])
})

describe("POST /admin/revendedores/cancelar-lote — autorização", () => {
  it("exige unidades.governanca, igual ao cancelamento individual", async () => {
    // Gerente de unidades administra a carteira, mas não cancela.
    requireAdmin.mockImplementation(
      adminGuardFor({ userId: "u2", role: "PMB_RESELLER_MGR" }).requireAdmin,
    )

    const res = await POST(req(["a"]))

    expect(res.status).toBe(403)
    expect(cancelTenant).not.toHaveBeenCalled()
  })

  /** A trava que impede um POST forjado de cancelar a rede inteira. */
  it("re-deriva a elegibilidade no servidor: só quem nunca pagou e está suspensa", async () => {
    await POST(req(["a", "b"]))

    const where = db.tenant.findMany.mock.calls[0][0].where
    expect(where.tenantPayments).toEqual(NEVER_ACTIVATED_WHERE.tenantPayments)
    expect(where.status).toBe("SUSPENDED")
    expect(where.slug).toEqual({ not: PMB_TENANT_SLUG })
    // Os ids do corpo entram como FILTRO, não como fonte da verdade.
    expect(where.id).toEqual({ in: ["a", "b"] })
  })

  it("aplica o recorte de carteira de quem chamou", async () => {
    requireAdmin.mockImplementation(
      adminGuardFor({ userId: "u9", role: "PMB_RESELLER_DIRECTOR" }).requireAdmin,
    )
    await POST(req(["a"]))
    expect(db.tenant.findMany).toHaveBeenCalled()
  })

  it("cancela só o que o servidor confirmou, e reporta os ignorados", async () => {
    // Cliente pediu 3; o servidor só reconhece 2 como elegíveis.
    db.tenant.findMany.mockResolvedValue([unidade("a"), unidade("b")])

    const res = await POST(req(["a", "b", "intrusa"]))
    const body = await res.json()

    expect(cancelTenant).toHaveBeenCalledTimes(2)
    expect(body.data.cancelled).toBe(2)
    expect(body.data.ignored).toBe(1)
  })
})

describe("POST /admin/revendedores/cancelar-lote — execução", () => {
  it("audita cada unidade cancelada, marcando a origem", async () => {
    await POST(req(["a", "b"]))

    expect(logAudit).toHaveBeenCalledTimes(2)
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "tenant.cancel",
        payloadAfter: expect.objectContaining({ origem: "lote_nunca_ativou" }),
      }),
    )
  })

  /** Uma unidade que falha não pode derrubar o lote nem sumir do relatório. */
  it("continua o lote quando uma unidade falha e devolve quais foram", async () => {
    cancelTenant
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        error: "Asaas fora do ar",
      } as never)
      .mockResolvedValueOnce({
        ok: true,
        cancelledSubscriptions: 1,
        deletedCharges: 0,
        studentsBlocked: 0,
        warnings: [],
        before: {
          slug: "b",
          status: "SUSPENDED",
          hadSubscription: true,
          hadPromoSubscription: false,
        },
      } as never)

    const res = await POST(req(["a", "b"]))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.cancelled).toBe(1)
    expect(body.data.failed).toEqual([
      { id: "a", slug: "a", error: "Asaas fora do ar" },
    ])
    // A que falhou não entra na auditoria de cancelamento.
    expect(logAudit).toHaveBeenCalledTimes(1)
  })

  /**
   * O aluno pagou o curso dele mesmo quando a unidade não pagou a mensalidade —
   * por isso o destino dos alunos vem da política de CADA unidade, não de uma
   * regra global do lote.
   */
  it("respeita a política de alunos de cada unidade", async () => {
    db.tenant.findMany.mockResolvedValue([
      { ...unidade("mantem"), cancellationPolicy: { keepStudentsActive: true } },
      { ...unidade("bloqueia"), cancellationPolicy: { keepStudentsActive: false } },
    ])

    await POST(req(["mantem", "bloqueia"]))

    expect(cancelTenant).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: "mantem" }),
      expect.objectContaining({ blockStudents: false }),
    )
    expect(cancelTenant).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: "bloqueia" }),
      expect.objectContaining({ blockStudents: true }),
    )
  })

  it("recusa corpo vazio", async () => {
    const res = await POST(req([]))
    expect(res.status).toBe(400)
    expect(cancelTenant).not.toHaveBeenCalled()
  })
})
