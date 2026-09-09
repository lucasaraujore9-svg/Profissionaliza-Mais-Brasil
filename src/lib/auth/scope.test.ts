import { describe, it, expect, vi, beforeEach } from "vitest"

// O projeto NÃO usa RLS no banco — o isolamento multi-tenant depende 100% destas
// funções. Este é o "teste de ouro": uma regressão aqui = vazamento cross-tenant.
// Mockamos o prisma para controlar salesTeamIds (User.findMany).
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findMany: vi.fn() } },
}))

import { prisma } from "@/lib/prisma"
import {
  tenantScopeWhere,
  canAccessTenantScope,
  leadScopeWhere,
  salesTeamIds,
} from "./scope"
import { PMB_TEAM_ROLES } from "./roles"
import { roleHasTenantCarteira } from "./admin-permissions"

const findMany = prisma.user.findMany as unknown as ReturnType<typeof vi.fn>

beforeEach(() => findMany.mockReset())

describe("tenantScopeWhere (QA-001 / SEG-001)", () => {
  it("SUPER_ADMIN vê tudo ({})", async () => {
    expect(await tenantScopeWhere({ userId: "u1", role: "SUPER_ADMIN" })).toEqual({})
  })
  it("PMB_RESELLER_MGR escopa por accountManagerId", async () => {
    expect(await tenantScopeWhere({ userId: "mgr", role: "PMB_RESELLER_MGR" })).toEqual({
      accountManagerId: "mgr",
    })
  })
  // O preset do diretor tem `unidades.viewAll`, então o admin-guard nem chega
  // aqui. Este ramo é a degradação quando alguém REVOGA o viewAll dele: cai na
  // carteira do gerente, não em "nenhuma unidade".
  it("PMB_RESELLER_DIRECTOR degrada para accountManagerId", async () => {
    expect(
      await tenantScopeWhere({ userId: "dir", role: "PMB_RESELLER_DIRECTOR" }),
    ).toEqual({ accountManagerId: "dir" })
  })
  it("PMB_REVENDA_SALES escopa por salesUserId próprio", async () => {
    expect(await tenantScopeWhere({ userId: "s1", role: "PMB_REVENDA_SALES" })).toEqual({
      salesUserId: "s1",
    })
  })
  it("PMB_SALES_MGR escopa pelo time (self + reports)", async () => {
    findMany.mockResolvedValue([{ id: "r1" }, { id: "r2" }])
    expect(await tenantScopeWhere({ userId: "mgr", role: "PMB_SALES_MGR" })).toEqual({
      salesUserId: { in: ["mgr", "r1", "r2"] },
    })
  })
  it("papéis sem acesso a unidades → null (rota deve negar/retornar vazio)", async () => {
    for (const role of ["PMB_SALES", "PMB_FINANCEIRO", "RESELLER", "DESCONHECIDO"]) {
      expect(await tenantScopeWhere({ userId: "x", role })).toBeNull()
    }
  })
})

/**
 * `ROLES_WITH_TENANT_CARTEIRA` vive em `admin-permissions.ts` (módulo PURO,
 * importável por componente `"use client"`) enquanto o `switch` de verdade está
 * aqui, num módulo que toca o Prisma. Duas cópias divergem em silêncio: um papel
 * novo ganharia ramo aqui e a tela de Equipe continuaria avisando que a
 * permissão não tem efeito — ou, pior, pararia de avisar para um papel que
 * segue sem carteira. Esta é a trava.
 */
describe("paridade com ROLES_WITH_TENANT_CARTEIRA", () => {
  it("tem ramo estrutural exatamente para os papéis declarados", async () => {
    findMany.mockResolvedValue([])
    for (const role of PMB_TEAM_ROLES) {
      const where = await tenantScopeWhere({ userId: "u1", role })
      expect(where !== null, role).toBe(roleHasTenantCarteira(role))
    }
  })
})

describe("canAccessTenantScope — não vaza unidade de outro escopo", () => {
  const own = { accountManagerId: "mgr", salesUserId: "s1" }
  const alheio = { accountManagerId: "outro", salesUserId: "outro" }

  it("SUPER_ADMIN acessa qualquer unidade", async () => {
    expect(await canAccessTenantScope({ userId: "u", role: "SUPER_ADMIN" }, alheio)).toBe(true)
  })
  it("tenant null → false", async () => {
    expect(await canAccessTenantScope({ userId: "u", role: "SUPER_ADMIN" }, null)).toBe(false)
  })
  it("PMB_RESELLER_MGR: só a própria (accountManagerId), nega alheia", async () => {
    expect(await canAccessTenantScope({ userId: "mgr", role: "PMB_RESELLER_MGR" }, own)).toBe(true)
    expect(await canAccessTenantScope({ userId: "mgr", role: "PMB_RESELLER_MGR" }, alheio)).toBe(false)
  })
  it("PMB_RESELLER_DIRECTOR sem viewAll: só a própria carteira", async () => {
    expect(
      await canAccessTenantScope({ userId: "mgr", role: "PMB_RESELLER_DIRECTOR" }, own),
    ).toBe(true)
    expect(
      await canAccessTenantScope({ userId: "mgr", role: "PMB_RESELLER_DIRECTOR" }, alheio),
    ).toBe(false)
  })
  it("PMB_REVENDA_SALES: só a própria (salesUserId), nega alheia", async () => {
    expect(await canAccessTenantScope({ userId: "s1", role: "PMB_REVENDA_SALES" }, own)).toBe(true)
    expect(await canAccessTenantScope({ userId: "s1", role: "PMB_REVENDA_SALES" }, alheio)).toBe(false)
  })
  it("PMB_SALES_MGR: só unidades do time; nega fora do time e salesUserId null", async () => {
    findMany.mockResolvedValue([{ id: "s1" }])
    expect(
      await canAccessTenantScope({ userId: "mgr", role: "PMB_SALES_MGR" }, { accountManagerId: null, salesUserId: "s1" }),
    ).toBe(true)
    findMany.mockResolvedValue([{ id: "s1" }])
    expect(
      await canAccessTenantScope({ userId: "mgr", role: "PMB_SALES_MGR" }, { accountManagerId: null, salesUserId: "fora" }),
    ).toBe(false)
    expect(
      await canAccessTenantScope({ userId: "mgr", role: "PMB_SALES_MGR" }, { accountManagerId: null, salesUserId: null }),
    ).toBe(false)
  })
  it("papéis sem escopo (PMB_SALES, RESELLER) nunca acessam", async () => {
    expect(await canAccessTenantScope({ userId: "x", role: "PMB_SALES" }, own)).toBe(false)
    expect(await canAccessTenantScope({ userId: "x", role: "RESELLER" }, own)).toBe(false)
  })
})

describe("leadScopeWhere", () => {
  it("SUPER_ADMIN → {}", async () => {
    expect(await leadScopeWhere({ userId: "u", role: "SUPER_ADMIN" })).toEqual({})
  })
  it("PMB_REVENDA_SALES → ownerUserId próprio", async () => {
    expect(await leadScopeWhere({ userId: "s1", role: "PMB_REVENDA_SALES" })).toEqual({
      ownerUserId: "s1",
    })
  })
  it("PMB_SALES_MGR → ownerUserId do time", async () => {
    findMany.mockResolvedValue([{ id: "r1" }])
    expect(await leadScopeWhere({ userId: "mgr", role: "PMB_SALES_MGR" })).toEqual({
      ownerUserId: { in: ["mgr", "r1"] },
    })
  })
  it("PMB_RESELLER_DIRECTOR → ownerUserId próprio (sem o viewAll do preset)", async () => {
    expect(
      await leadScopeWhere({ userId: "dir", role: "PMB_RESELLER_DIRECTOR" }),
    ).toEqual({ ownerUserId: "dir" })
  })
  it("PMB_RESELLER_MGR não enxerga leads B2B → null", async () => {
    expect(await leadScopeWhere({ userId: "x", role: "PMB_RESELLER_MGR" })).toBeNull()
    expect(await leadScopeWhere({ userId: "x", role: "PMB_SALES" })).toBeNull()
  })
})

describe("salesTeamIds inclui sempre o próprio gerente", () => {
  it("retorna [managerId, ...reports]", async () => {
    findMany.mockResolvedValue([{ id: "a" }, { id: "b" }])
    expect(await salesTeamIds("mgr")).toEqual(["mgr", "a", "b"])
  })
})

