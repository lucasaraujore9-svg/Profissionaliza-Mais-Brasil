import { describe, expect, it } from "vitest"
import { formatCnpj, isValidCnpj } from "./cnpj"

describe("isValidCnpj", () => {
  it("aceita CNPJ válido com e sem máscara (caso Meraki, 2026-11-04)", () => {
    expect(isValidCnpj("69.942.034/0001-00")).toBe(true)
    expect(isValidCnpj("69942034000100")).toBe(true)
    expect(isValidCnpj("66.553.170/0001-01")).toBe(true)
  })

  it("rejeita dígito verificador errado, tamanho errado e dígitos repetidos", () => {
    expect(isValidCnpj("69.942.034/0001-01")).toBe(false)
    expect(isValidCnpj("69.942.034/0001-10")).toBe(false)
    expect(isValidCnpj("012.599.730-26")).toBe(false)
    expect(isValidCnpj("11.111.111/1111-11")).toBe(false)
  })
})

describe("formatCnpj", () => {
  it("aplica a máscara", () => {
    expect(formatCnpj("69942034000100")).toBe("69.942.034/0001-00")
  })
})
