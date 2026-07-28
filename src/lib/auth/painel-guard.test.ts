import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: vi.fn() },
    tenantMember: { findUnique: vi.fn() },
  },
}))
vi.mock("@/lib/auth/reseller-session", () => ({
  requireResellerSession: vi.fn(),
}))
vi.mock("@/lib/auth/painel-preview", () => ({ readPreviewRole: vi.fn() }))
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`)
  }),
}))

import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { readPreviewRole } from "@/lib/auth/painel-preview"
import { painelContext, requirePainel, requirePainelPage } from "./painel-guard"

const p = prisma as unknown as {
  user: { findFirst: ReturnType<typeof vi.fn> }
  tenantMember: { findUnique: ReturnType<typeof vi.fn> }
}
const sessionMock = requireResellerSession as unknown as ReturnType<typeof vi.fn>
const previewMock = readPreviewRole as unknown as ReturnType<typeof vi.fn>

/** Sessão de um membro (não-dono) com o papel/overrides informados. */
function asMember(
  role: string,
  extra: string[] = [],
  revoked: string[] = [],
  status = "ATIVO",
) {
  sessionMock.mockResolvedValue({ userId: "u1", tenantId: "t1" })
  p.user.findFirst.mockResolvedValue(null)
  p.tenantMember.findUnique.mockResolvedValue({
    role,
    status,
    maxDiscount: 10,
    extraPermissions: extra,
    revokedPermissions: revoked,
  })
}

function asOwner() {
  sessionMock.mockResolvedValue({ userId: "owner1", tenantId: "t1" })
  p.user.findFirst.mockResolvedValue({ id: "owner1" })
  p.tenantMember.findUnique.mockResolvedValue(null)
  previewMock.mockResolvedValue(null)
}

beforeEach(() => {
  vi.clearAllMocks()
  previewMock.mockResolvedValue(null)
})

describe("painelContext", () => {
  it("devolve null sem sessão de revendedor", async () => {
    sessionMock.mockResolvedValue(null)
    expect(await painelContext()).toBeNull()
  })

  it("dono recebe papel owner e todas as permissões", async () => {
    asOwner()
    const ctx = await painelContext()
    expect(ctx?.isOwner).toBe(true)
    expect(ctx?.memberRole).toBe("owner")
    expect(ctx?.can("gateway.manage")).toBe(true)
    expect(ctx?.can("equipe.manage")).toBe(true)
  })

  it("membro sem TenantMember não entra (fail-closed)", async () => {
    sessionMock.mockResolvedValue({ userId: "u1", tenantId: "t1" })
    p.user.findFirst.mockResolvedValue(null)
    p.tenantMember.findUnique.mockResolvedValue(null)
    expect(await painelContext()).toBeNull()
  })

  it("membro inativo não entra", async () => {
    asMember("manager", [], [], "INATIVO")
    expect(await painelContext()).toBeNull()
  })

  it("papel legado desconhecido cai no preset mais restrito", async () => {
    asMember("viewer")
    const ctx = await painelContext()
    expect(ctx?.memberRole).toBe("consultant")
    expect(ctx?.can("financeiro.view")).toBe(false)
  })

  it("aplica os overrides por pessoa", async () => {
    asMember("consultant", ["financeiro.view"], ["cupons.view"])
    const ctx = await painelContext()
    expect(ctx?.can("financeiro.view")).toBe(true)
    expect(ctx?.can("cupons.view")).toBe(false)
  })

  it("override não concede permissão exclusiva do dono", async () => {
    asMember("manager", ["equipe.manage", "conta.delete"])
    const ctx = await painelContext()
    expect(ctx?.can("equipe.manage")).toBe(false)
    expect(ctx?.can("conta.delete")).toBe(false)
  })
})

describe("escopo de dados", () => {
  it("vendedor sem viewAll é filtrado pelo que ele originou", async () => {
    asMember("consultant")
    const ctx = await painelContext()
    expect(ctx?.scope.alunos).toEqual({
      enrollments: { some: { soldByUserId: "u1" } },
    })
    expect(ctx?.scope.vendas).toEqual({ soldByUserId: "u1" })
    expect(ctx?.scope.leads).toEqual({ ownerUserId: "u1" })
  })

  it("gerente com viewAll vê a unidade inteira", async () => {
    asMember("manager")
    const ctx = await painelContext()
    expect(ctx?.scope.alunos).toEqual({})
    expect(ctx?.scope.vendas).toEqual({})
    expect(ctx?.scope.leads).toEqual({})
  })

  it("secretaria vê todos os alunos mas não tem vendas.viewAll", async () => {
    asMember("support")
    const ctx = await painelContext()
    expect(ctx?.scope.alunos).toEqual({})
    expect(ctx?.scope.vendas).toEqual({ soldByUserId: "u1" })
  })

  it("override de viewAll amplia o escopo", async () => {
    asMember("consultant", ["alunos.viewAll"])
    const ctx = await painelContext()
    expect(ctx?.scope.alunos).toEqual({})
    expect(ctx?.scope.vendas).toEqual({ soldByUserId: "u1" })
  })
})

describe("prévia 'ver como'", () => {
  it("aplica o papel simulado e remove toda escrita", async () => {
    asOwner()
    previewMock.mockResolvedValue("manager")
    const ctx = await painelContext()
    expect(ctx?.isPreview).toBe(true)
    expect(ctx?.memberRole).toBe("manager")
    expect(ctx?.can("financeiro.view")).toBe(true)
    // Gerente TEM vitrine.manage no preset — a prévia derruba por ser escrita.
    expect(ctx?.can("vitrine.manage")).toBe(false)
    expect(ctx?.can("alunos.manage")).toBe(false)
    expect(ctx?.can("gateway.manage")).toBe(false)
  })

  it("membro comum nunca entra em prévia, mesmo com cookie presente", async () => {
    asMember("consultant")
    previewMock.mockResolvedValue("manager")
    const ctx = await painelContext()
    expect(ctx?.isPreview).toBe(false)
    expect(ctx?.memberRole).toBe("consultant")
    expect(previewMock).not.toHaveBeenCalled()
  })
})

describe("requirePainel", () => {
  it("401 sem sessão", async () => {
    sessionMock.mockResolvedValue(null)
    const guard = await requirePainel("dashboard.view")
    expect(guard.ok).toBe(false)
    if (!guard.ok) expect(guard.response.status).toBe(401)
  })

  it("403 quando falta a permissão", async () => {
    asMember("consultant")
    const guard = await requirePainel("financeiro.view")
    expect(guard.ok).toBe(false)
    if (!guard.ok) expect(guard.response.status).toBe(403)
  })

  it("403 quando falta UMA das permissões exigidas", async () => {
    asMember("finance")
    const guard = await requirePainel("financeiro.view", "vitrine.manage")
    expect(guard.ok).toBe(false)
    if (!guard.ok) expect(guard.response.status).toBe(403)
  })

  it("passa quando tem todas", async () => {
    asMember("finance")
    const guard = await requirePainel("financeiro.view", "financeiro.export")
    expect(guard.ok).toBe(true)
  })
})

describe("requirePainelPage", () => {
  it("redireciona ao login sem sessão", async () => {
    sessionMock.mockResolvedValue(null)
    await expect(requirePainelPage("dashboard.view")).rejects.toThrow(
      "REDIRECT:/login?callbackUrl=/painel",
    )
  })

  it("redireciona ao /painel sem permissão", async () => {
    asMember("consultant")
    await expect(requirePainelPage("financeiro.view")).rejects.toThrow(
      "REDIRECT:/painel",
    )
  })

  it("devolve o contexto quando autorizado", async () => {
    asMember("manager")
    const ctx = await requirePainelPage("financeiro.view")
    expect(ctx.memberRole).toBe("manager")
  })
})
