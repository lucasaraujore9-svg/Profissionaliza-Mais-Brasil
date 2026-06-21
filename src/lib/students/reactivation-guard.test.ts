import { describe, it, expect } from "vitest"
import { canReactivateUnderTenant } from "./reactivation-guard"

describe("canReactivateUnderTenant (SAAS-002)", () => {
  it("reativa quando o tenant está ACTIVE", () => {
    expect(canReactivateUnderTenant("ACTIVE")).toBe(true)
  })

  it("NÃO reativa quando o tenant está SUSPENDED (inadimplência não pode ser furada)", () => {
    expect(canReactivateUnderTenant("SUSPENDED")).toBe(false)
  })

  it("NÃO reativa quando o tenant está PENDING ou CANCELLED", () => {
    expect(canReactivateUnderTenant("PENDING")).toBe(false)
    expect(canReactivateUnderTenant("CANCELLED")).toBe(false)
  })

  it("NÃO reativa quando o status do tenant está ausente", () => {
    expect(canReactivateUnderTenant(null)).toBe(false)
    expect(canReactivateUnderTenant(undefined)).toBe(false)
  })
})
