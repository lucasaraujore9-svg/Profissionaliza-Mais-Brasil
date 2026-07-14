import { describe, it, expect } from "vitest"
import { cpfFromDocument, isValidCpf, stripCpf } from "./cpf"

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

// Criação de revenda: ownerCpfCnpj (documento de cobrança) só vira User.cpf
// (identificador de login) quando é um CPF válido — CNPJ fica só no Asaas.
describe("cpfFromDocument", () => {
  it("CPF válido (com ou sem máscara) → 11 dígitos normalizados", () => {
    expect(cpfFromDocument("529.982.247-25")).toBe("52998224725")
    expect(cpfFromDocument("52998224725")).toBe("52998224725")
  })

  it("CNPJ → null (nunca vira identificador de login)", () => {
    expect(cpfFromDocument("12.345.678/0001-95")).toBeNull()
    expect(cpfFromDocument("12345678000195")).toBeNull()
  })

  it("CPF inválido ou vazio → null", () => {
    expect(cpfFromDocument("123.456.789-00")).toBeNull()
    expect(cpfFromDocument("")).toBeNull()
  })
})
