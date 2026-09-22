import { describe, it, expect } from "vitest"
import { cleanMatrizTopic, matrizFromLessonTitles } from "./matriz"

describe("cleanMatrizTopic", () => {
  it("tira a numeração nua com separador (formato da fornecedora legada)", () => {
    expect(cleanMatrizTopic("01 - Introdução")).toBe("Introdução")
    expect(cleanMatrizTopic("12. A Igreja Primitiva")).toBe("A Igreja Primitiva")
  })

  it("tira a numeração rotulada, com ou sem separador (formato do LMS)", () => {
    expect(cleanMatrizTopic("Aula 2 - Dicas de Ouro")).toBe("Dicas de Ouro")
    expect(cleanMatrizTopic("Aula 1 Boas vindas")).toBe("Boas vindas")
    expect(cleanMatrizTopic("Módulo 03: Acabamento")).toBe("Acabamento")
  })

  it("NÃO tira número sem separador — '5S na empresa' continua inteiro", () => {
    expect(cleanMatrizTopic("5S na empresa")).toBe("5S na empresa")
    // Sem esta guarda, "10 dicas de vendas" viraria "dicas de vendas".
    expect(cleanMatrizTopic("10 dicas de vendas")).toBe("10 dicas de vendas")
  })

  it("título que era só numeração é descartado (vira string vazia)", () => {
    expect(cleanMatrizTopic("03 - ")).toBe("")
    expect(cleanMatrizTopic("Aula 7")).toBe("")
    expect(cleanMatrizTopic("   ")).toBe("")
    expect(cleanMatrizTopic(null)).toBe("")
  })
})

describe("matrizFromLessonTitles", () => {
  it("preserva a ordem recebida e descarta o que não vira tópico", () => {
    expect(
      matrizFromLessonTitles(["Aula 1 - Abertura", "Aula 2", "", null, "5S na empresa"]),
    ).toEqual(["Abertura", "5S na empresa"])
  })
})
