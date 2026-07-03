import { describe, it, expect } from "vitest"
import { MAX_EXPORT_ROWS, truncationNotice } from "./export-limit"

// PERF-012: os exports CSV (comissões/saques/financeiro) passaram a capar em
// MAX_EXPORT_ROWS e sinalizar truncamento numa linha final.
describe("export-limit (PERF-012)", () => {
  it("teto espelha o MAX_REPORT_ROWS do hub de BI (10.000)", () => {
    expect(MAX_EXPORT_ROWS).toBe(10_000)
  })

  it("aviso de truncamento é uma linha-comentário com o teto e instrução", () => {
    const notice = truncationNotice()
    expect(notice.startsWith("#")).toBe(true)
    expect(notice).toContain("10000")
    expect(notice).toMatch(/período/)
  })
})
