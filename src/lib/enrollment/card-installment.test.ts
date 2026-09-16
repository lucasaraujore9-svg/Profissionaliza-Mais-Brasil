import { describe, expect, it } from "vitest"
import {
  CardInstallmentOutOfOrderError,
  closesOnLastInstallment,
  isFirstCardInstallment,
} from "./card-installment"
import { isTransientWebhookError } from "@/lib/webhooks/transient"

describe("isFirstCardInstallment", () => {
  it("usa o nº da parcela quando o Asaas o informa", () => {
    const base = { externalPaymentId: "pay_x", enrollmentAsaasPaymentId: "pay_x" }
    expect(isFirstCardInstallment({ ...base, installmentNumber: 1 })).toBe(true)
    // Mesmo sendo a cobrança gravada: o nº do Asaas manda.
    expect(isFirstCardInstallment({ ...base, installmentNumber: 2 })).toBe(false)
  })

  it("sem o nº, só a cobrança que o checkout gravou", () => {
    expect(
      isFirstCardInstallment({
        installmentNumber: null,
        externalPaymentId: "pay_1",
        enrollmentAsaasPaymentId: "pay_1",
      }),
    ).toBe(true)
    expect(
      isFirstCardInstallment({
        installmentNumber: undefined,
        externalPaymentId: "pay_2",
        enrollmentAsaasPaymentId: "pay_1",
      }),
    ).toBe(false)
  })

  it("sem o nº e sem cobrança gravada: na dúvida, não é a 1ª", () => {
    // Recusar custa uma reentrega; liberar o curso duas vezes não se desfaz.
    expect(
      isFirstCardInstallment({
        installmentNumber: null,
        externalPaymentId: "pay_1",
        enrollmentAsaasPaymentId: null,
      }),
    ).toBe(false)
  })
})

describe("closesOnLastInstallment", () => {
  it("cartão parcelado nunca encerra a matrícula ao quitar", () => {
    expect(closesOnLastInstallment("CARD_INSTALLMENT")).toBe(false)
  })

  it("mensalidade e carnê mantêm o comportamento", () => {
    expect(closesOnLastInstallment("MONTHLY")).toBe(true)
    expect(closesOnLastInstallment("BOLETO_INSTALLMENT")).toBe(true)
  })
})

describe("parcela fora de ordem no webhook", () => {
  it("é transitória: o gateway reentrega em vez de o evento ser engolido", () => {
    // O webhook da PMB só relança erro transitório. Engolido, a parcela sumiria
    // do extrato para sempre.
    expect(isTransientWebhookError(new CardInstallmentOutOfOrderError("e1", "pay_2"))).toBe(true)
  })
})
