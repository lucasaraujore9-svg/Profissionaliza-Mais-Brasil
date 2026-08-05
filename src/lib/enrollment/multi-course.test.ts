import { describe, it, expect } from "vitest"
import { dedupeIds, saleItemLabel, MAX_SALE_COURSES } from "./multi-course"

describe("dedupeIds", () => {
  // A ordem importa: o 1º curso da lista vira a matrícula PRIMÁRIA (a que
  // carrega a cobrança). Um dedupe que reordena trocaria o curso principal.
  it("remove repetidos preservando a ordem escolhida", () => {
    expect(dedupeIds(["b", "a", "b", "c", "a"])).toEqual(["b", "a", "c"])
  })

  it("lista vazia continua vazia", () => {
    expect(dedupeIds([])).toEqual([])
  })
})

describe("saleItemLabel", () => {
  it("um curso: o próprio nome", () => {
    expect(saleItemLabel(["Excel Avançado"])).toBe("Excel Avançado")
  })

  it("vários cursos: contagem + lista", () => {
    expect(saleItemLabel(["Excel", "Word", "Power BI"])).toBe(
      "3 cursos: Excel, Word, Power BI",
    )
  })

  // O corte tem que sacrificar a LISTA, nunca a contagem — é ela que o aluno
  // usa para conferir que está pagando pelo pacote inteiro.
  it("corta a lista, nunca o prefixo com a contagem", () => {
    const label = saleItemLabel(["A".repeat(50), "B".repeat(50), "C".repeat(50)], 40)
    expect(label.startsWith("3 cursos: ")).toBe(true)
    expect(label.length).toBeLessThanOrEqual(40)
  })

  it("sem cursos devolve um rótulo neutro em vez de string vazia", () => {
    expect(saleItemLabel([])).toBe("Curso")
  })
})

describe("MAX_SALE_COURSES", () => {
  it("é um teto positivo (o schema das rotas depende dele)", () => {
    expect(MAX_SALE_COURSES).toBeGreaterThan(1)
  })
})
