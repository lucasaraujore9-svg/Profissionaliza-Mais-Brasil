import { describe, expect, it } from "vitest"
import { formatPhone, isValidPhone, normalizePhone } from "./phone"

describe("normalizePhone", () => {
  it("remove máscara e prefixo internacional", () => {
    expect(normalizePhone("(11) 99999-9999")).toBe("11999999999")
    expect(normalizePhone("+55 11 99999-9999")).toBe("11999999999")
    expect(normalizePhone("+55 11 3333-4444")).toBe("1133334444")
  })

  // Contrato deliberado: só o prefixo do `+55` sai. A discagem internacional
  // (`0055…`) fica como está — trocar isso mexeria no `isValidPhone` usado nos
  // checkouts.
  it("não mexe em prefixo de discagem internacional", () => {
    expect(normalizePhone("005511999999999")).toBe("005511999999999")
  })
})

describe("isValidPhone", () => {
  it("aceita fixo (10) e celular (11) com 9 após o DDD", () => {
    expect(isValidPhone("1133334444")).toBe(true)
    expect(isValidPhone("(11) 99999-9999")).toBe(true)
  })

  it("rejeita tamanho errado e celular sem o 9", () => {
    expect(isValidPhone("999999999")).toBe(false)
    expect(isValidPhone("11899999999")).toBe(false)
  })
})

describe("formatPhone", () => {
  it("formata celular e fixo", () => {
    expect(formatPhone("11999999999")).toBe("(11) 99999-9999")
    expect(formatPhone("1133334444")).toBe("(11) 3333-4444")
  })

  it("formata número que já veio mascarado (registros antigos)", () => {
    expect(formatPhone("(11) 9 9999-9999")).toBe("(11) 99999-9999")
    expect(formatPhone("+55 (11) 99999-9999")).toBe("(11) 99999-9999")
  })

  // O cadastro de revenda gravava o telefone exatamente como digitado, então
  // há registros fora do padrão 10/11 dígitos. Devolver o original mantém o
  // dado visível em vez de sumir com ele.
  it("devolve o original quando não reconhece o formato", () => {
    expect(formatPhone("99999-9999")).toBe("99999-9999")
    expect(formatPhone("ramal 42")).toBe("ramal 42")
  })
})
