import { describe, it, expect } from "vitest"
import {
  assertPmbCharge,
  assertCouponMatchesEnrollment,
  isPmbTenantSlug,
  TenantGatewayIsolationError,
} from "./assert-tenant-gateway"

describe("isPmbTenantSlug", () => {
  it("trata null/undefined como PMB (legado)", () => {
    expect(isPmbTenantSlug(null)).toBe(true)
    expect(isPmbTenantSlug(undefined)).toBe(true)
  })
  it("reconhece o placeholder __pmb__", () => {
    expect(isPmbTenantSlug("__pmb__")).toBe(true)
  })
  it("revenda real não é PMB", () => {
    expect(isPmbTenantSlug("polobetim")).toBe(false)
  })
})

describe("assertPmbCharge", () => {
  it("permite venda PMB legítima (matrícula null + aluno __pmb__)", () => {
    expect(() =>
      assertPmbCharge({ enrollmentTenantId: null, studentTenantSlug: "__pmb__", context: "t" }),
    ).not.toThrow()
  })
  it("permite aluno PMB legado (slug null)", () => {
    expect(() =>
      assertPmbCharge({ enrollmentTenantId: null, studentTenantSlug: null, context: "t" }),
    ).not.toThrow()
  })
  // Regressão do incidente Polo Betim: aluno de revenda cobrado na conta-mãe.
  it("BLOQUEIA aluno de revenda na conta-mãe (caso Polo Betim)", () => {
    expect(() =>
      assertPmbCharge({ enrollmentTenantId: null, studentTenantSlug: "polobetim", context: "t" }),
    ).toThrow(TenantGatewayIsolationError)
  })
  it("BLOQUEIA matrícula de revenda (tenantId != null) na conta-mãe", () => {
    expect(() =>
      assertPmbCharge({ enrollmentTenantId: "t_betim", studentTenantSlug: "__pmb__", context: "t" }),
    ).toThrow(TenantGatewayIsolationError)
  })
})

describe("assertCouponMatchesEnrollment", () => {
  it("aceita cupom PMB em matrícula PMB (null/null)", () => {
    expect(() =>
      assertCouponMatchesEnrollment({ couponTenantId: null, enrollmentTenantId: null, context: "t" }),
    ).not.toThrow()
  })
  it("aceita cupom de revenda na matrícula da mesma revenda", () => {
    expect(() =>
      assertCouponMatchesEnrollment({
        couponTenantId: "t_betim",
        enrollmentTenantId: "t_betim",
        context: "t",
      }),
    ).not.toThrow()
  })
  it("BLOQUEIA cupom PMB numa matrícula de revenda", () => {
    expect(() =>
      assertCouponMatchesEnrollment({ couponTenantId: null, enrollmentTenantId: "t_betim", context: "t" }),
    ).toThrow(TenantGatewayIsolationError)
  })
  it("BLOQUEIA cupom de revenda numa matrícula PMB", () => {
    expect(() =>
      assertCouponMatchesEnrollment({ couponTenantId: "t_betim", enrollmentTenantId: null, context: "t" }),
    ).toThrow(TenantGatewayIsolationError)
  })
})
