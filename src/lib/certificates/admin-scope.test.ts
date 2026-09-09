import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock do Prisma: so o branch de certificado DE UNIDADE consulta o banco.
const tenantFindUnique = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: { tenant: { findUnique: (...args: unknown[]) => tenantFindUnique(...args) } },
}))

import { adminCtx } from "@/test/admin-ctx"
import { adminCanAccessCertTenant } from "./admin-scope"

describe("adminCanAccessCertTenant — escopo de certificado (regressao R24/IDOR)", () => {
  beforeEach(() => tenantFindUnique.mockReset())

  it("quem enxerga a rede inteira acessa qualquer certificado, sem tocar no banco", async () => {
    const ctx = adminCtx({ role: "SUPER_ADMIN" })
    expect(await adminCanAccessCertTenant(ctx, null)).toBe(true)
    expect(await adminCanAccessCertTenant(ctx, "tenant-x")).toBe(true)
    expect(tenantFindUnique).not.toHaveBeenCalled()
  })

  it("quem so opera a vitrine PMB nunca alcanca certificado de revendedor", async () => {
    const ctx = adminCtx({ role: "PMB_SALES" })
    expect(await adminCanAccessCertTenant(ctx, null)).toBe(true)
    expect(await adminCanAccessCertTenant(ctx, "tenant-x")).toBe(false)
  })

  it("gerente de unidades nunca acessa certificado da vitrine PMB (null)", async () => {
    const ctx = adminCtx({ role: "PMB_RESELLER_MGR", userId: "mgr1" })
    expect(await adminCanAccessCertTenant(ctx, null)).toBe(false)
    expect(tenantFindUnique).not.toHaveBeenCalled()
  })

  it("gerente de unidades acessa apenas a propria carteira", async () => {
    const ctx = adminCtx({ role: "PMB_RESELLER_MGR", userId: "mgr1" })

    tenantFindUnique.mockResolvedValueOnce({ accountManagerId: "mgr1", salesUserId: null })
    expect(await adminCanAccessCertTenant(ctx, "tenant-meu")).toBe(true)

    tenantFindUnique.mockResolvedValueOnce({ accountManagerId: "outro", salesUserId: null })
    expect(await adminCanAccessCertTenant(ctx, "tenant-alheio")).toBe(false)

    tenantFindUnique.mockResolvedValueOnce(null)
    expect(await adminCanAccessCertTenant(ctx, "tenant-inexistente")).toBe(false)
  })

  /**
   * Regressao da revisao: conceder `certificados.manage` por override a um
   * papel sem alcance de unidade nao pode entregar certificado de unidade
   * nenhuma junto. O Designer e o assunto limpo — sem `alunos.view` (a porta da
   * vitrine PMB) e sem ramo em `lib/auth/scope.ts`.
   */
  it("papel sem escopo de unidade e negado mesmo com a permissao concedida", async () => {
    const ctx = adminCtx({
      role: "PMB_DESIGNER",
      extra: ["certificados.manage"],
    })
    expect(await adminCanAccessCertTenant(ctx, null)).toBe(false)
    tenantFindUnique.mockResolvedValueOnce({ accountManagerId: "x", salesUserId: null })
    expect(await adminCanAccessCertTenant(ctx, "tenant-x")).toBe(false)
  })

  /**
   * Consequencia ASSUMIDA de por `unidades.viewAll` no preset do Financeiro
   * (2026-09-09): `viewAll` e o bypass do recorte de carteira em TODA parte, e
   * aqui tambem. O Financeiro nao tem `certificados.*` no preset — mas se
   * alguem conceder por override, o alcance e a rede inteira, nao uma carteira
   * (ele nao tem nenhuma). Fica registrado para nao ser descoberto por acidente.
   */
  it("financeiro alcanca a rede porque o preset carrega unidades.viewAll", async () => {
    const ctx = adminCtx({
      role: "PMB_FINANCEIRO",
      extra: ["certificados.manage"],
    })
    expect(await adminCanAccessCertTenant(ctx, "tenant-x")).toBe(true)
    expect(tenantFindUnique).not.toHaveBeenCalled()
  })
})
