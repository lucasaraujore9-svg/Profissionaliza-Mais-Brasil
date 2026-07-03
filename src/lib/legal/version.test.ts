import { describe, it, expect } from "vitest"
import { LEGAL_VERSION, CONSENT_VERSION, PRIVACY_UPDATED_AT, TERMS_UPDATED_AT } from "./version"

// LGPD-011: o consentimento gravado deve rastrear para a versão pública dos docs.
describe("versão legal centralizada (LGPD-011)", () => {
  it("CONSENT_VERSION é atrelada à versão pública dos documentos", () => {
    expect(CONSENT_VERSION).toBe(LEGAL_VERSION)
  })

  it("expõe as datas exibidas nas páginas de Política e Termos", () => {
    expect(PRIVACY_UPDATED_AT).toMatch(/\d{4}/)
    expect(TERMS_UPDATED_AT).toMatch(/\d{4}/)
  })

  it("não usa mais os identificadores de consentimento legados", () => {
    expect(CONSENT_VERSION).not.toBe("2026-05-v1")
    expect(CONSENT_VERSION).not.toBe("2026-06-v1")
  })
})
