import { describe, it, expect } from "vitest"
import { validateSlugFormat } from "./slug"

describe("validateSlugFormat (QA-008)", () => {
  it("aceita slug válido", () => {
    expect(validateSlugFormat("loja-da-ana")).toBeNull()
    expect(validateSlugFormat("revenda01")).toBeNull()
  })
  it("rejeita comprimento fora de 3..32", () => {
    expect(validateSlugFormat("ab")).toMatch(/3 e 32/)
    expect(validateSlugFormat("a".repeat(33))).toMatch(/3 e 32/)
  })
  it("rejeita caracteres inválidos", () => {
    expect(validateSlugFormat("Loja_Ana")).toMatch(/letras minúsculas/)
    expect(validateSlugFormat("loja ana")).toBeTruthy()
  })
  it("rejeita subdomínio reservado", () => {
    expect(validateSlugFormat("www")).toMatch(/reservado/)
    expect(validateSlugFormat("admin")).toMatch(/reservado/)
  })
  it("rejeita marca proibida", () => {
    expect(validateSlugFormat("livrecursos")).toBeTruthy()
  })
})
