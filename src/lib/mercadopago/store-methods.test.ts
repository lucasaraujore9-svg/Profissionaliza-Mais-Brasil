import { describe, it, expect } from "vitest"
import {
  availableStoreMethods,
  defaultStoreMethod,
  type MpAccountMethod,
} from "./store-methods"

// Conta COM PIX (revenda que vende OK): payment_methods traz `pix`.
const WITH_PIX: MpAccountMethod[] = [
  { id: "master", payment_type_id: "credit_card" },
  { id: "visa", payment_type_id: "credit_card" },
  { id: "pix", payment_type_id: "bank_transfer" },
  { id: "bolbradesco", payment_type_id: "ticket" },
  { id: "account_money", payment_type_id: "account_money" },
]

// Conta SEM PIX (conectandosaberes real): sem o método `pix`.
const WITHOUT_PIX: MpAccountMethod[] = [
  { id: "master", payment_type_id: "credit_card" },
  { id: "visa", payment_type_id: "credit_card" },
  { id: "elo", payment_type_id: "credit_card" },
  { id: "amex", payment_type_id: "credit_card" },
  { id: "debelo", payment_type_id: "debit_card" },
  { id: "bolbradesco", payment_type_id: "ticket" },
  { id: "account_money", payment_type_id: "account_money" },
]

describe("availableStoreMethods", () => {
  it("conta com PIX oferece os três métodos na ordem canônica", () => {
    expect(availableStoreMethods(WITH_PIX)).toEqual([
      "PIX",
      "CREDIT_CARD",
      "BOLETO",
    ])
  })

  it("conta SEM PIX não oferece PIX (só Cartão e Boleto)", () => {
    expect(availableStoreMethods(WITHOUT_PIX)).toEqual(["CREDIT_CARD", "BOLETO"])
  })

  it("reconhece PIX tanto por id 'pix' quanto por payment_type_id 'bank_transfer'", () => {
    expect(availableStoreMethods([{ id: "pix" }])).toEqual(["PIX"])
    expect(
      availableStoreMethods([{ id: "qualquer", payment_type_id: "bank_transfer" }]),
    ).toEqual(["PIX"])
  })

  it("conta só de cartão devolve apenas CREDIT_CARD", () => {
    expect(
      availableStoreMethods([{ id: "master", payment_type_id: "credit_card" }]),
    ).toEqual(["CREDIT_CARD"])
  })

  it("lista vazia devolve vazio (form cai no fallback = mostra tudo)", () => {
    expect(availableStoreMethods([])).toEqual([])
  })
})

describe("defaultStoreMethod", () => {
  it("prefere PIX quando disponível", () => {
    expect(defaultStoreMethod(["PIX", "CREDIT_CARD", "BOLETO"])).toBe("PIX")
  })

  it("cai em Cartão quando não há PIX (caso conectandosaberes)", () => {
    expect(defaultStoreMethod(["CREDIT_CARD", "BOLETO"])).toBe("CREDIT_CARD")
  })

  it("cai em Boleto quando é o único", () => {
    expect(defaultStoreMethod(["BOLETO"])).toBe("BOLETO")
  })

  it("lista vazia → PIX (fallback neutro)", () => {
    expect(defaultStoreMethod([])).toBe("PIX")
  })
})
