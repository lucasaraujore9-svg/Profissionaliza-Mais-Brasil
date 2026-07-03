import { describe, it, expect } from "vitest"
import { resolveSegment } from "./receita-vendas"

// SEG-009: PMB_SALES não pode ver receita de revendedores. O módulo de BI
// "receita-vendas" deve forçar o segmento PMB para PMB_SALES, ignorando o
// `segment` pedido na query — espelha o least-privilege do export CSV.
describe("receita-vendas — resolveSegment (SEG-009)", () => {
  it("força segment=pmb para PMB_SALES mesmo pedindo 'todos'", () => {
    const sp = new URLSearchParams({ segment: "todos" })
    expect(resolveSegment("PMB_SALES", sp)).toEqual({
      segment: "pmb",
      scopedToPmb: true,
    })
  })

  it("força segment=pmb para PMB_SALES mesmo pedindo 'revenda'", () => {
    const sp = new URLSearchParams({ segment: "revenda" })
    expect(resolveSegment("PMB_SALES", sp)).toEqual({
      segment: "pmb",
      scopedToPmb: true,
    })
  })

  it("SUPER_ADMIN respeita o segment da query", () => {
    expect(resolveSegment("SUPER_ADMIN", new URLSearchParams({ segment: "revenda" }))).toEqual({
      segment: "revenda",
      scopedToPmb: false,
    })
    expect(resolveSegment("SUPER_ADMIN", new URLSearchParams({ segment: "pmb" }))).toEqual({
      segment: "pmb",
      scopedToPmb: false,
    })
    expect(resolveSegment("SUPER_ADMIN", new URLSearchParams())).toEqual({
      segment: "todos",
      scopedToPmb: false,
    })
  })

  it("PMB_FINANCEIRO (visão de ecossistema) respeita o segment da query", () => {
    expect(resolveSegment("PMB_FINANCEIRO", new URLSearchParams({ segment: "revenda" }))).toEqual({
      segment: "revenda",
      scopedToPmb: false,
    })
  })

  it("segment inválido cai em 'todos' para papéis não escopados", () => {
    expect(resolveSegment("SUPER_ADMIN", new URLSearchParams({ segment: "xpto" }))).toEqual({
      segment: "todos",
      scopedToPmb: false,
    })
  })
})
