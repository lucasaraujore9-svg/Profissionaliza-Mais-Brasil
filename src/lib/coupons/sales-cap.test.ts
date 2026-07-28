import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn() } },
}))

import { prisma } from "@/lib/prisma"
import { resolveAdminPermissions } from "@/lib/auth/admin-permissions"
import type { PmbTeamRole } from "@/lib/auth/roles"
import {
  resolveSalesCap,
  effectiveSalesCap,
  PMB_SALES_DEFAULT_CAP,
} from "./sales-cap"

const findUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>

/** Contexto mínimo aceito por `effectiveSalesCap`, derivado do preset real. */
function ctx(role: PmbTeamRole, userId = "u1") {
  const perms = resolveAdminPermissions(role)
  return { userId, can: (p: "vendas.descontoIlimitado") => perms.has(p) }
}

describe("resolveSalesCap", () => {
  it("com desconto sem teto devolve 100, mesmo com maxDiscount setado", () => {
    expect(resolveSalesCap(true)).toBe(100)
    expect(resolveSalesCap(true, 10)).toBe(100)
  })

  it("sem override individual cai no padrão (50)", () => {
    expect(resolveSalesCap(false)).toBe(PMB_SALES_DEFAULT_CAP)
    expect(resolveSalesCap(false, null)).toBe(PMB_SALES_DEFAULT_CAP)
  })

  it("com override usa o valor individual", () => {
    expect(resolveSalesCap(false, 10)).toBe(10)
    expect(resolveSalesCap(false, 0)).toBe(0)
  })

  it("clampa override fora de [0, 100]", () => {
    expect(resolveSalesCap(false, 150)).toBe(100)
    expect(resolveSalesCap(false, -5)).toBe(0)
  })
})

describe("effectiveSalesCap", () => {
  it("não consulta o banco para quem tem desconto sem teto", async () => {
    expect(await effectiveSalesCap(ctx("SUPER_ADMIN"))).toBe(100)
    expect(findUnique).not.toHaveBeenCalled()
  })

  it("lê User.maxDiscount do banco para o vendedor de curso", async () => {
    findUnique.mockResolvedValue({ maxDiscount: 10 })
    expect(await effectiveSalesCap(ctx("PMB_SALES"))).toBe(10)
  })

  it("usuário inexistente ou sem override => padrão", async () => {
    findUnique.mockResolvedValue(null)
    expect(await effectiveSalesCap(ctx("PMB_SALES"))).toBe(PMB_SALES_DEFAULT_CAP)
  })

  /**
   * Regressão da escalada encontrada na revisão: enquanto o cap era
   * `role !== "PMB_SALES" -> 100`, conceder `vendas.create`/`cupons.manage` por
   * override a um gerente de unidades entregava desconto de 100% sem teto.
   */
  it("papel sem `vendas.descontoIlimitado` continua capado, seja qual for", async () => {
    findUnique.mockResolvedValue(null)
    for (const role of [
      "PMB_RESELLER_MGR",
      "PMB_FINANCEIRO",
      "PMB_SALES_MGR",
      "PMB_REVENDA_SALES",
      "PMB_DESIGNER",
    ] as const) {
      expect(await effectiveSalesCap(ctx(role)), role).toBe(PMB_SALES_DEFAULT_CAP)
    }
  })
})
