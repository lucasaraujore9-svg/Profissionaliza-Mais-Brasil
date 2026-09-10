import { describe, expect, it, vi, beforeEach } from "vitest"

const tenantFindUnique = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: { tenant: { findUnique: (...a: unknown[]) => tenantFindUnique(...a) } },
}))

const requirePainel = vi.fn()
vi.mock("@/lib/auth/painel-guard", () => ({
  requirePainel: (...a: unknown[]) => requirePainel(...a),
}))

const { requireSubscriptionModule } = await import("./module-gate")
const { SUBSCRIPTIONS_DISABLED } = await import("./module")

const CTX = { tenantId: "t1", userId: "u1" }

beforeEach(() => {
  tenantFindUnique.mockReset().mockResolvedValue({ subscriptionsEnabled: true })
  requirePainel.mockReset().mockResolvedValue({ ok: true, ctx: CTX })
})

describe("requireSubscriptionModule", () => {
  it("passa quando a unidade tem o modulo ligado", async () => {
    const res = await requireSubscriptionModule("assinaturas.manage")
    expect(res.ok).toBe(true)
    expect(requirePainel).toHaveBeenCalledWith("assinaturas.manage")
    expect(tenantFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "t1" } }),
    )
  })

  it("recusa com 403 e codigo proprio quando o modulo esta desligado", async () => {
    // O preset do dono e `owner: ALL`: sem esta trava, TODA revenda montava
    // plano de assinatura, com a permissao `assinaturas.manage` sozinha.
    tenantFindUnique.mockResolvedValue({ subscriptionsEnabled: false })
    const res = await requireSubscriptionModule("assinaturas.manage")
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.response.status).toBe(403)
      await expect(res.response.json()).resolves.toMatchObject({
        code: SUBSCRIPTIONS_DISABLED,
      })
    }
  })

  it("unidade inexistente e fail-closed", async () => {
    tenantFindUnique.mockResolvedValue(null)
    const res = await requireSubscriptionModule("assinaturas.view")
    expect(res.ok).toBe(false)
  })

  it("permissao vem ANTES do modulo — quem nao pode ver nao descobre que existe", async () => {
    const forbidden = { ok: false as const, response: new Response(null, { status: 403 }) }
    requirePainel.mockResolvedValue(forbidden)
    const res = await requireSubscriptionModule("assinaturas.manage")
    expect(res).toBe(forbidden)
    expect(tenantFindUnique).not.toHaveBeenCalled()
  })
})
