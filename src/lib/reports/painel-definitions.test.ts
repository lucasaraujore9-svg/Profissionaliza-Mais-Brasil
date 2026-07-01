import { describe, it, expect } from "vitest"
import {
  PAINEL_REPORT_DEFS,
  getPainelReportRunner,
  painelReportDef,
} from "./painel-definitions"

// Invariante P0: nenhum runner do painel roda sem tenantId — bloqueia export
// cross-tenant estruturalmente (o guard lança ANTES de tocar o Prisma).
describe("painel-definitions — anti-cross-tenant", () => {
  it("todo runner registrado lança quando tenantId está ausente", async () => {
    for (const def of PAINEL_REPORT_DEFS) {
      const runner = getPainelReportRunner(def.id)
      expect(runner).not.toBeNull()
      await expect(
        runner!.generate({ tenantId: "" }),
      ).rejects.toThrow(/tenantId/)
    }
  })

  it("def/runner inexistente retorna undefined/null", () => {
    expect(painelReportDef("inexistente")).toBeUndefined()
    expect(getPainelReportRunner("inexistente")).toBeNull()
  })
})
