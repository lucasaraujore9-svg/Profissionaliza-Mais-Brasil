import { describe, it, expect } from "vitest"
import { isValidCpf, stripCpf } from "./cpf"

describe("stripCpf", () => {
  it("remove máscara, mantém só dígitos", () => {
    expect(stripCpf("529.982.247-25")).toBe("52998224725")
  })
})

describe("isValidCpf", () => {
  it("aceita CPF válido (com e sem máscara)", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true)
    expect(isValidCpf("52998224725")).toBe(true)
  })

  it("rejeita dígitos verificadores incorretos", () => {
    expect(isValidCpf("529.982.247-24")).toBe(false)
    expect(isValidCpf("123.456.789-00")).toBe(false)
  })

  it("rejeita sequência de dígitos repetidos", () => {
    expect(isValidCpf("111.111.111-11")).toBe(false)
    expect(isValidCpf("000.000.000-00")).toBe(false)
  })

  it("rejeita tamanho inválido", () => {
    expect(isValidCpf("123")).toBe(false)
    expect(isValidCpf("")).toBe(false)
  })
})
