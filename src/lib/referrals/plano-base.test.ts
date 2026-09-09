import { describe, it, expect } from "vitest"
import {
  PLANO_BASE_PRO,
  PLANO_BASE_PROFISSIONALIZA,
  proporcaoDoMes,
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

  it("juros e multa não viram comissão extra — o teto por fatura é para isso", () => {
    // Fatura em atraso chega com acréscimo; ele é do gateway e da PMB, não
    // receita de revenda a ratear.
    expect(proporcaoPaga(268, 239)).toBe(1)
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

describe("proporcaoDoMes — o teto é POR FATURA, nunca sobre a soma", () => {
  it("duas mensalidades cheias na mesma competência valem DUAS faixas", () => {
    // Caso otymus: a de agosto paga atrasada em 05/09 e a de setembro paga em
    // 30/09 caem as duas na competência de setembro. São duas receitas. Um teto
    // sobre a soma pagaria uma só — e a atrasada, que já não gerou comissão em
    // agosto justamente por ter atrasado, nunca geraria comissão nenhuma.
    expect(proporcaoDoMes([239, 239], 239)).toBe(2)
  })

  it("uma mensalidade quitada em duas partes continua valendo UMA faixa", () => {
    // O que a soma preserva é a RECEITA, não a contagem de boletos.
    expect(proporcaoDoMes([119.5, 119.5], 239)).toBe(1)
  })

  it("cada fatura tem seu próprio teto: juros na primeira não paga a segunda", () => {
    expect(proporcaoDoMes([300, 119.5], 239)).toBe(1.5)
  })

  it("sem fatura no mês, zero", () => {
    expect(proporcaoDoMes([], 239)).toBe(0)
  })

  it("estorno lançado como cobrança não subtrai a fatura boa", () => {
    // Piso por fatura: a negativa é ignorada, não abate a legítima. Reverter
    // comissão paga é clawback, com revisão humana.
    expect(proporcaoDoMes([239, -239], 239)).toBe(1)
  })
})
