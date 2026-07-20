import { describe, expect, it } from "vitest"
import {
  APRENDIZADO_DEFAULT,
  APRENDIZADO_MAX_ITEMS,
  APRENDIZADO_MAX_LEN,
  aprendizadoToText,
  parseAprendizado,
  resolveAprendizado,
} from "./aprendizado"

describe("parseAprendizado", () => {
  it("quebra por linha, trima e descarta linhas em branco", () => {
    expect(parseAprendizado("  Um  \n\n Dois \n   \nTrês\n")).toEqual([
      "Um",
      "Dois",
      "Três",
    ])
  })

  it("texto vazio vira lista vazia (herda o nível de cima)", () => {
    expect(parseAprendizado("")).toEqual([])
    expect(parseAprendizado("   \n \n ")).toEqual([])
  })

  it("corta o excedente em vez de estourar os limites", () => {
    const muitos = Array.from({ length: 30 }, (_, i) => `Item ${i}`).join("\n")
    expect(parseAprendizado(muitos)).toHaveLength(APRENDIZADO_MAX_ITEMS)

    const longo = "x".repeat(APRENDIZADO_MAX_LEN + 50)
    expect(parseAprendizado(longo)[0]).toHaveLength(APRENDIZADO_MAX_LEN)
  })

  it("faz round-trip com aprendizadoToText", () => {
    const items = ["Corte", "Barba", "Coloração"]
    expect(parseAprendizado(aprendizadoToText(items))).toEqual(items)
  })
})

describe("resolveAprendizado", () => {
  const revenda = ["Só desta vitrine"]
  const pmb = ["Padrão da PMB"]

  it("a lista da revenda vence a da PMB", () => {
    expect(resolveAprendizado(revenda, pmb)).toEqual(revenda)
  })

  it("revenda vazia herda o padrão da PMB", () => {
    expect(resolveAprendizado([], pmb)).toEqual(pmb)
  })

  it("REGRESSÃO: curso que ninguém editou mantém o texto genérico", () => {
    expect(resolveAprendizado([], [])).toEqual(APRENDIZADO_DEFAULT)
    expect(resolveAprendizado(undefined, null)).toEqual(APRENDIZADO_DEFAULT)
    expect(resolveAprendizado()).toEqual(APRENDIZADO_DEFAULT)
  })
})
