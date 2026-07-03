import { describe, it, expect } from "vitest"

// QA-009: fumaça que prova que o glob do vitest.config passou a reconhecer
// arquivos `.test.tsx`. Antes o include era só `.test.ts` e este arquivo seria
// silenciosamente ignorado (falso verde). Não renderiza DOM (roda em env node):
// só constrói um elemento JSX e inspeciona o `type`.
describe("glob .test.tsx (QA-009)", () => {
  it("reconhece e executa um arquivo .test.tsx", () => {
    const el = <section data-role="smoke">ok</section>
    expect(el.type).toBe("section")
    expect(el.props["data-role"]).toBe("smoke")
  })
})
