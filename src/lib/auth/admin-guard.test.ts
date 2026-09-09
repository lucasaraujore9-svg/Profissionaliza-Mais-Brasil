import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn(), findMany: vi.fn() } },
}))
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`)
  }),
}))

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import {
  adminContext,
  adminHome,
  requireAdmin,
  requireAdminAny,
  requireAdminPage,
} from "./admin-guard"

const p = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> }
}
const authMock = auth as unknown as ReturnType<typeof vi.fn>

function signedIn(
  role: string,
  {
    extra = [] as string[],
    revoked = [] as string[],
    status = "ATIVO",
    userId = "u1",
  } = {},
) {
  authMock.mockResolvedValue({ user: { id: userId, role } })
  p.user.findUnique.mockResolvedValue({
    id: userId,
    name: "Fulano",
    email: "fulano@pmb.com.br",
    role,
    status,
    extraPermissions: extra,
    revokedPermissions: revoked,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  p.user.findMany.mockResolvedValue([])
})

describe("adminContext", () => {
  it("devolve null sem sessão", async () => {
    authMock.mockResolvedValue(null)
    expect(await adminContext()).toBeNull()
  })

  it("devolve null para papel fora da equipe interna (revendedor)", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", role: "RESELLER" } })
    expect(await adminContext()).toBeNull()
    expect(p.user.findUnique).not.toHaveBeenCalled()
  })

  it("devolve null para conta inativa mesmo com token válido", async () => {
    signedIn("SUPER_ADMIN", { status: "INATIVO" })
    expect(await adminContext()).toBeNull()
  })

  it("o papel do banco vence o do token", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", role: "SUPER_ADMIN" } })
    p.user.findUnique.mockResolvedValue({
      id: "u1",
      name: "Rebaixado",
      email: "x@pmb.com.br",
      role: "PMB_DESIGNER",
      status: "ATIVO",
      extraPermissions: [],
      revokedPermissions: [],
    })
    const ctx = await adminContext()
    expect(ctx?.role).toBe("PMB_DESIGNER")
    expect(ctx?.can("configuracoes.manage")).toBe(false)
  })

  it("aplica extra e revoked por pessoa", async () => {
    signedIn("PMB_SALES", {
      extra: ["financeiro.view"],
      revoked: ["cupons.manage"],
    })
    const ctx = await adminContext()
    expect(ctx?.can("financeiro.view")).toBe(true)
    expect(ctx?.can("cupons.manage")).toBe(false)
    expect(ctx?.can("vendas.create")).toBe(true)
  })

  it("não deixa extra conceder permissão exclusiva do super admin", async () => {
    signedIn("PMB_FINANCEIRO", { extra: ["equipe.manage"] })
    const ctx = await adminContext()
    expect(ctx?.can("equipe.manage")).toBe(false)
  })

  /**
   * `unidades.viewAll` é o substituto de todo bypass `role === "SUPER_ADMIN"`:
   * quem a tem passa pelo recorte de carteira em senha do titular,
   * impersonação, gateway e export de comissões. Concedê-la por override
   * transformaria um gerente de unidades em super admin de fato.
   */
  it("não deixa extra conceder unidades.viewAll", async () => {
    signedIn("PMB_RESELLER_MGR", { extra: ["unidades.viewAll"] })
    const ctx = await adminContext()
    expect(ctx?.can("unidades.viewAll")).toBe(false)
    expect(await ctx?.unidadesWhere()).toEqual({ accountManagerId: "u1" })
  })
})

describe("escopo de dados", () => {
  it("sem vendas.viewAll, vendas e pagamentos filtram por autoria", async () => {
    signedIn("PMB_SALES")
    const ctx = await adminContext()
    expect(ctx?.scope.vendas).toEqual({ soldByUserId: "u1" })
    expect(ctx?.scope.pagamentos).toEqual({ soldByUserId: "u1" })
    expect(ctx?.scope.alunos).toEqual({
      enrollments: { some: { soldByUserId: "u1" } },
    })
  })

  it("com vendas.viewAll o filtro some", async () => {
    signedIn("SUPER_ADMIN")
    const ctx = await adminContext()
    expect(ctx?.scope.vendas).toEqual({})
    expect(ctx?.scope.alunos).toEqual({})
  })

  it("unidadesWhere devolve null para quem não vê unidade", async () => {
    signedIn("PMB_SALES")
    const ctx = await adminContext()
    expect(await ctx?.unidadesWhere()).toBeNull()
  })

  it("unidades.viewAll ignora o recorte do papel", async () => {
    signedIn("SUPER_ADMIN")
    const ctx = await adminContext()
    expect(await ctx?.unidadesWhere()).toEqual({})
  })

  it("gerente de unidades só vê a própria carteira", async () => {
    signedIn("PMB_RESELLER_MGR")
    const ctx = await adminContext()
    expect(await ctx?.unidadesWhere()).toEqual({ accountManagerId: "u1" })
  })

  it("vendedor de revenda só vê as unidades que vendeu", async () => {
    signedIn("PMB_REVENDA_SALES")
    const ctx = await adminContext()
    expect(await ctx?.unidadesWhere()).toEqual({ salesUserId: "u1" })
  })

  it("unidades.view concedida por override sem recorte no papel não abre a rede", async () => {
    // PMB_SALES não tem recorte em scope.ts (cai no `default:`): conceder
    // `unidades.view` sozinho não pode virar "vê tudo" por acidente. `viewAll`
    // é SUPER_EXCLUSIVE justamente para que abrir a rede seja decisão de
    // PRESET, revisável, e não um checkbox marcado por engano.
    signedIn("PMB_SALES", { extra: ["unidades.view"] })
    const ctx = await adminContext()
    expect(await ctx?.unidadesWhere()).toBeNull()
  })

  /**
   * O outro lado da mesma regra: quem PRECISA da rede inteira recebe pelo
   * preset. O Financeiro cobra a mensalidade de todas as unidades e, até
   * 2026-09-09, abria /admin/revendedores com a lista vazia — marcar
   * `unidades.view` na ficha dele em /admin/equipe não tinha efeito nenhum,
   * porque sem `viewAll` o escopo estrutural devolvia `null`.
   */
  it("financeiro enxerga a rede inteira pelo preset", async () => {
    signedIn("PMB_FINANCEIRO")
    const ctx = await adminContext()
    expect(await ctx?.unidadesWhere()).toEqual({})
    expect(await ctx?.canAccessTenant({ accountManagerId: null, salesUserId: null })).toBe(
      true,
    )
  })

  /**
   * Regressão da revisão: o recorte do dinheiro era re-derivado em cada rota
   * como `can("unidades.view") && !can("unidades.viewAll")`. Isso invertia o
   * sentido — revogar `unidades.view` REMOVIA o filtro e ampliava o acesso — e
   * assumia `accountManagerId` para papéis ligados por `salesUserId`.
   */
  describe("comissoesScope", () => {
    it("visão financeira do ecossistema não é recortada", async () => {
      signedIn("PMB_FINANCEIRO")
      expect(await (await adminContext())?.comissoesScope()).toEqual({})
    })

    it("gerente de unidades fica na própria carteira", async () => {
      signedIn("PMB_RESELLER_MGR")
      expect(await (await adminContext())?.comissoesScope()).toEqual({
        accountManagerId: "u1",
      })
    })

    it("vendedor de revenda é recortado por salesUserId, não accountManagerId", async () => {
      signedIn("PMB_REVENDA_SALES", { extra: ["indicacoes.view"] })
      expect(await (await adminContext())?.comissoesScope()).toEqual({
        salesUserId: "u1",
      })
    })

    it("revogar unidades.view FECHA o acesso, nunca amplia", async () => {
      signedIn("PMB_RESELLER_MGR", { revoked: ["unidades.view"] })
      expect(await (await adminContext())?.comissoesScope()).toBeNull()
    })

    it("quem não alcança unidade nenhuma é negado", async () => {
      signedIn("PMB_SALES")
      expect(await (await adminContext())?.comissoesScope()).toBeNull()
    })
  })

  it("canAccessTenant respeita a atribuição da unidade", async () => {
    signedIn("PMB_RESELLER_MGR")
    const ctx = await adminContext()
    expect(
      await ctx?.canAccessTenant({ accountManagerId: "u1", salesUserId: null }),
    ).toBe(true)
    expect(
      await ctx?.canAccessTenant({ accountManagerId: "outro", salesUserId: null }),
    ).toBe(false)
    expect(await ctx?.canAccessTenant(null)).toBe(false)
  })
})

describe("requireAdmin", () => {
  it("401 sem sessão", async () => {
    authMock.mockResolvedValue(null)
    const guard = await requireAdmin("dashboard.view")
    expect(guard.ok).toBe(false)
    if (!guard.ok) expect(guard.response.status).toBe(401)
  })

  it("403 sem a permissão", async () => {
    signedIn("PMB_DESIGNER")
    const guard = await requireAdmin("financeiro.viewAll")
    expect(guard.ok).toBe(false)
    if (!guard.ok) expect(guard.response.status).toBe(403)
  })

  it("exige TODAS as permissões informadas", async () => {
    signedIn("PMB_RESELLER_MGR")
    const guard = await requireAdmin("unidades.view", "financeiro.viewAll")
    expect(guard.ok).toBe(false)
  })

  it("passa com a permissão", async () => {
    signedIn("PMB_FINANCEIRO")
    const guard = await requireAdmin("financeiro.viewAll")
    expect(guard.ok).toBe(true)
  })

  it("requireAdminAny basta uma", async () => {
    signedIn("PMB_RESELLER_MGR")
    const guard = await requireAdminAny("financeiro.viewAll", "unidades.view")
    expect(guard.ok).toBe(true)
  })
})

describe("requireAdminPage", () => {
  it("manda para o login sem sessão", async () => {
    authMock.mockResolvedValue(null)
    await expect(requireAdminPage("dashboard.view")).rejects.toThrow(
      "REDIRECT:/login?callbackUrl=/admin",
    )
  })

  it("manda para a home acessível quando falta permissão", async () => {
    signedIn("PMB_DESIGNER")
    await expect(requireAdminPage("financeiro.viewAll")).rejects.toThrow(
      "REDIRECT:/admin/artes",
    )
  })

  it("designer sem artes cai no perfil, nunca em loop no dashboard", async () => {
    signedIn("PMB_DESIGNER", { revoked: ["artes.view"] })
    const ctx = await adminContext()
    expect(ctx && adminHome(ctx)).toBe("/admin/meu-perfil")
  })
})
