import { describe, it, expect } from "vitest"
import {
  PLANO_BASE_PRO,
  PLANO_BASE_PROFISSIONALIZA,
  proporcaoPaga,
  valorBasePlano,
} from "./plano-base"

describe("valorBasePlano", () => {
  it("PRO (com Automação) é R$ 239; sem o módulo, R$ 209", () => {
    expect(valorBasePlano(true)).toBe(PLANO_BASE_PRO)
    expect(valorBasePlano(false)).toBe(PLANO_BASE_PROFISSIONALIZA)
  })
})

describe("proporcaoPaga", () => {
  it("mensalidade cheia paga a faixa inteira", () => {
    expect(proporcaoPaga(239, 239)).toBe(1)
  })

  it("cortesia de 50% paga metade — o caso que a regra existe para cobrir", () => {
    expect(proporcaoPaga(119.5, 239)).toBe(0.5)
    expect(239 * 0.5).toBe(119.5)
  })

  it("não pagou nada no mês: proporção zero", () => {
    expect(proporcaoPaga(0, 239)).toBe(0)
  })

  it("DUAS faturas no mesmo mês não dobram a comissão", () => {
    // A atrasada + a corrente. A faixa é por unidade/mês, não por fatura.
    expect(proporcaoPaga(478, 239)).toBe(1)
  })

  it("plano de tabela que não bate com a flag também para em 1", () => {
    // Unidade sem o módulo Automação pagando R$ 239 (existe em produção):
    // 239/209 = 1,14 → capado, o indicador recebe a faixa cheia e nunca mais.
    expect(proporcaoPaga(239, 209)).toBe(1)
  })

  it("valor negativo não vira comissão negativa", () => {
    // Estorno lançado como cobrança. Reverter comissão já paga é clawback, com
    // revisão humana — nunca um número negativo entrando calado no fechamento.
    expect(proporcaoPaga(-239, 239)).toBe(0)
  })

  it("base zero ou inválida devolve 0 em vez de Infinity/NaN", () => {
    expect(proporcaoPaga(239, 0)).toBe(0)
    expect(proporcaoPaga(Number.NaN, 239)).toBe(0)
    expect(proporcaoPaga(239, Number.NaN)).toBe(0)
  })
})
