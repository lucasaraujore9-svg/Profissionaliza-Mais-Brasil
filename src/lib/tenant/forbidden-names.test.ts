import { describe, it, expect } from "vitest"
import { containsForbiddenName, forbiddenNameError } from "./forbidden-names"

describe("forbidden-names — guard de marca reservada (QA-008)", () => {
  it("bloqueia marcas reservadas em variações de espaço/hífen/acento/caixa", () => {
    for (const v of [
      "Bolsa Mais Brasil",
      "bolsa-mais-brasil",
      "BolsaMaisBrasil",
      "Bólsa Mais Brasíl",
      "Profissionaliza Mais Brasil",
      "Livre Cursos",
      "livre-cursos",
      "Escola de Ensino a Distância",
    ]) {
      expect(containsForbiddenName(v)).toBe(true)
    }
  })

  it("libera 'profissionalizante(s)' (termo genérico) e nomes neutros", () => {
    expect(containsForbiddenName("Cursos Profissionalizantes")).toBe(false)
    expect(containsForbiddenName("Escola Profissionalizante do Vale")).toBe(false)
    expect(containsForbiddenName("Academia do Saber")).toBe(false)
  })

  it("null/undefined/vazio → false", () => {
    expect(containsForbiddenName(null)).toBe(false)
    expect(containsForbiddenName(undefined)).toBe(false)
    expect(containsForbiddenName("")).toBe(false)
  })

  it("forbiddenNameError devolve mensagem quando proibido, senão null", () => {
    expect(forbiddenNameError("Livre Cursos")).toBeTruthy()
    expect(forbiddenNameError("Academia do Saber")).toBeNull()
  })
})
