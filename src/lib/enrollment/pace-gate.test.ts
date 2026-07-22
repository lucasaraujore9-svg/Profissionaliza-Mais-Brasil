import { describe, it, expect } from "vitest"
import type { PaymentType } from "@prisma/client"
import {
  computeAllowedPercent,
  hasOpenInstallmentPlan,
  isPaceBlocked,
  isPaceGatedPlan,
  evaluatePace,
  paceBlockedMessage,
} from "./pace-gate"

function plan(
  paymentType: PaymentType,
  installmentsPaid: number,
  installmentsTotal: number | null,
) {
  return { paymentType, installmentsPaid, installmentsTotal }
}

describe("isPaceGatedPlan", () => {
  it("cobre carne e mensalidade com mais de uma parcela", () => {
    expect(isPaceGatedPlan(plan("BOLETO_INSTALLMENT", 1, 6))).toBe(true)
    expect(isPaceGatedPlan(plan("MONTHLY", 1, 12))).toBe(true)
  })

  it("ignora pagamento a vista e cartao parcelado", () => {
    expect(isPaceGatedPlan(plan("ONE_TIME", 1, null))).toBe(false)
    // Cartao: o credito ja foi autorizado integralmente na compra.
    expect(isPaceGatedPlan(plan("CARD_INSTALLMENT", 1, 6))).toBe(false)
  })

  it("ignora parcelamento em 1x (na pratica, a vista)", () => {
    expect(isPaceGatedPlan(plan("BOLETO_INSTALLMENT", 1, 1))).toBe(false)
    expect(isPaceGatedPlan(plan("BOLETO_INSTALLMENT", 0, null))).toBe(false)
  })
})

describe("computeAllowedPercent", () => {
  it("2x libera 50% ja na 1a parcela e 100% na 2a", () => {
    expect(computeAllowedPercent(plan("BOLETO_INSTALLMENT", 1, 2))).toBe(50)
    expect(computeAllowedPercent(plan("BOLETO_INSTALLMENT", 2, 2))).toBe(100)
  })

  it("arredonda para BAIXO — nunca entrega mais do que foi pago", () => {
    // 1/3 = 33,33% -> 33 (nao 34)
    expect(computeAllowedPercent(plan("BOLETO_INSTALLMENT", 1, 3))).toBe(33)
    expect(computeAllowedPercent(plan("BOLETO_INSTALLMENT", 2, 3))).toBe(66)
    // 1/6 = 16,66% -> 16
    expect(computeAllowedPercent(plan("BOLETO_INSTALLMENT", 1, 6))).toBe(16)
    expect(computeAllowedPercent(plan("BOLETO_INSTALLMENT", 3, 6))).toBe(50)
  })

  it("escala com o plano escolhido (mensalidade 12x)", () => {
    expect(computeAllowedPercent(plan("MONTHLY", 1, 12))).toBe(8)
    expect(computeAllowedPercent(plan("MONTHLY", 6, 12))).toBe(50)
    expect(computeAllowedPercent(plan("MONTHLY", 12, 12))).toBe(100)
  })

  it("devolve 100 fora da regra da cota", () => {
    expect(computeAllowedPercent(plan("ONE_TIME", 0, null))).toBe(100)
    expect(computeAllowedPercent(plan("CARD_INSTALLMENT", 1, 10))).toBe(100)
  })

  it("tolera contagem fora da faixa sem estourar 0-100", () => {
    // Reprocessamento de webhook poderia, em tese, passar de total.
    expect(computeAllowedPercent(plan("BOLETO_INSTALLMENT", 9, 6))).toBe(100)
    expect(computeAllowedPercent(plan("BOLETO_INSTALLMENT", -1, 6))).toBe(0)
  })
})

describe("hasOpenInstallmentPlan", () => {
  it("e verdadeiro enquanto faltar parcela (base da trava de certificado)", () => {
    expect(hasOpenInstallmentPlan(plan("BOLETO_INSTALLMENT", 1, 6))).toBe(true)
    expect(hasOpenInstallmentPlan(plan("BOLETO_INSTALLMENT", 5, 6))).toBe(true)
  })

  it("e falso com o plano quitado ou fora da regra", () => {
    expect(hasOpenInstallmentPlan(plan("BOLETO_INSTALLMENT", 6, 6))).toBe(false)
    expect(hasOpenInstallmentPlan(plan("ONE_TIME", 0, null))).toBe(false)
    expect(hasOpenInstallmentPlan(plan("CARD_INSTALLMENT", 1, 6))).toBe(false)
  })
})

describe("isPaceBlocked", () => {
  it("trava AO ATINGIR a cota, nao depois dela", () => {
    const base = plan("BOLETO_INSTALLMENT", 1, 2) // cota 50%
    expect(isPaceBlocked({ ...base, progressPercent: 49 })).toBe(false)
    expect(isPaceBlocked({ ...base, progressPercent: 50 })).toBe(true)
    expect(isPaceBlocked({ ...base, progressPercent: 51 })).toBe(true)
  })

  it("nunca trava com o plano quitado, mesmo com 100% assistido", () => {
    expect(
      isPaceBlocked({ ...plan("BOLETO_INSTALLMENT", 6, 6), progressPercent: 100 }),
    ).toBe(false)
  })

  it("nunca trava fora da regra da cota", () => {
    expect(
      isPaceBlocked({ ...plan("ONE_TIME", 0, null), progressPercent: 100 }),
    ).toBe(false)
  })

  it("trata progresso nulo como zero", () => {
    // Cota 16% (1/6): quem ainda nao comecou nao esta travado.
    expect(
      isPaceBlocked({ ...plan("BOLETO_INSTALLMENT", 1, 6), progressPercent: null }),
    ).toBe(false)
    // Cota 0% (nada pago): travado ja na largada.
    expect(
      isPaceBlocked({ ...plan("BOLETO_INSTALLMENT", 0, 6), progressPercent: null }),
    ).toBe(true)
  })
})

describe("evaluatePace", () => {
  it("resume o estado para motor/API/UI", () => {
    expect(
      evaluatePace({ ...plan("BOLETO_INSTALLMENT", 2, 6), progressPercent: 40 }),
    ).toEqual({
      gated: true,
      allowedPercent: 33,
      blocked: true,
      installmentsPaid: 2,
      installmentsTotal: 6,
      remaining: 4,
    })
  })

  it("nao reporta parcelas faltantes fora da regra", () => {
    const state = evaluatePace({
      ...plan("ONE_TIME", 0, null),
      progressPercent: 90,
    })
    expect(state.gated).toBe(false)
    expect(state.blocked).toBe(false)
    expect(state.remaining).toBe(0)
  })
})

describe("paceBlockedMessage", () => {
  it("fala 'parcela' no carne e 'mensalidade' no mensal", () => {
    const carne = evaluatePace({
      ...plan("BOLETO_INSTALLMENT", 1, 2),
      progressPercent: 50,
    })
    expect(paceBlockedMessage(carne, "BOLETO_INSTALLMENT")).toContain(
      "Você liberou 50% do curso",
    )
    expect(paceBlockedMessage(carne, "BOLETO_INSTALLMENT")).toContain(
      "1 de 2 parcelas pagas",
    )

    const mensal = evaluatePace({
      ...plan("MONTHLY", 1, 12),
      progressPercent: 10,
    })
    expect(paceBlockedMessage(mensal, "MONTHLY")).toContain(
      "1 de 12 mensalidades pagas",
    )
    expect(paceBlockedMessage(mensal, "MONTHLY")).toContain(
      "próxima mensalidade",
    )
  })
})
