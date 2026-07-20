/**
 * Testes do parser de `ReferralMonthlyCommission.linesSnapshot`.
 *
 * Por que este modulo merece teste proprio: ele e o unico ponto que decide
 * QUAIS linhas viram numero em relatorio financeiro (PDF do demonstrativo, os
 * dois CSVs, telas de comissoes do admin e BI). O campo e `Json?` no Prisma — o
 * banco nao valida nada — entao o type guard e a unica barreira entre um
 * snapshot corrompido/antigo e um valor publicado para o revendedor.
 *
 * O produtor canonico e `MonthlyLine` / o `lines.push({...})` de ./monthly.ts.
 * Os fixtures abaixo replicam EXATAMENTE o que aquele motor grava (ramo FIXED e
 * ramo PERCENT), para que o parser nunca fique mais estrito que o produtor.
 */
import { describe, it, expect } from "vitest"
import {
  isMonthlyCommissionLine,
  linePercent,
  parseLinesSnapshot,
  type MonthlyCommissionLine,
} from "./lines-snapshot"

/**
 * Linha no formato do ramo PERCENT de computeForReferrer:
 *   { tenantId, name, mensalidade: Number(mensalidade), amount: Number(line),
 *     rateType: "PERCENT", rate: bracket.value, phaseIndex: active.index }
 */
const linhaPercent: MonthlyCommissionLine = {
  tenantId: "tn_indicada_1",
  name: "Unidade Sao Paulo",
  mensalidade: 239,
  amount: 119.5,
  rateType: "PERCENT",
  rate: 50,
  phaseIndex: 0,
}

/**
 * Linha no formato do ramo FIXED de computeForReferrer:
 *   { ..., mensalidade: Number(u.planValue), amount: bracket.value,
 *     rateType: "FIXED", rate: bracket.value, phaseIndex: active.index }
 */
const linhaFixed: MonthlyCommissionLine = {
  tenantId: "tn_indicada_2",
  name: "Unidade Recife",
  mensalidade: 209,
  amount: 40,
  rateType: "FIXED",
  rate: 40,
  phaseIndex: 1,
}

/** Clona a linha PERCENT e sobrescreve um campo com lixo. */
function comCampo(campo: string, valor: unknown): Record<string, unknown> {
  return { ...linhaPercent, [campo]: valor }
}

describe("parseLinesSnapshot — round-trip com o formato gravado por monthly.ts", () => {
  it("deixa passar inteiro o array que o motor grava (FIXED + PERCENT)", () => {
    // Contrato central: o parser NAO pode ser mais estrito que o produtor.
    // Se este teste quebrar, o motor gravou um formato que os relatorios
    // silenciosamente descartam — a comissao some da tela sem erro nenhum.
    const snapshot: unknown = JSON.parse(
      JSON.stringify([linhaPercent, linhaFixed]),
    )
    expect(parseLinesSnapshot(snapshot)).toEqual([linhaPercent, linhaFixed])
  })

  it("preserva o valor de comissao do bug original (50% sobre R$ 239 = R$ 119,50)", () => {
    // Regressao do bug que motivou a unificacao: a regra do INDICADOR (50%)
    // era lida do lado errado do par e caia no padrao global de 10%
    // (R$ 23,90). Aqui travamos que a quebra por unidade chega intacta ao
    // relatorio — o parser nao pode arredondar, coagir nem descartar.
    const [linha] = parseLinesSnapshot([linhaPercent])
    expect(linha).toBeDefined()
    expect(linha?.amount).toBe(119.5)
    expect(linha?.mensalidade).toBe(239)
    expect(linePercent(linha as MonthlyCommissionLine)).toBe(50)
  })

  it("aceita linha sem os campos opcionais (snapshot de versao anterior)", () => {
    // rateType/rate/phaseIndex sao opcionais na interface: snapshots gravados
    // antes das fases nao podem ser descartados, senao o demonstrativo antigo
    // perde a quebra por unidade e cai no agregado.
    const legado = {
      tenantId: "tn_legado",
      name: "Unidade Antiga",
      mensalidade: 199,
      amount: 19.9,
    }
    expect(parseLinesSnapshot([legado])).toEqual([legado])
  })

  it("aceita zeros e negativos legitimos (0 nao e 'ausente')", () => {
    // Faixa 0% existe (ver parseBrackets em ./rules) e amount 0 e um valor
    // real, nao um campo faltando. Descartar aqui apagaria a unidade do
    // demonstrativo.
    const zerada = {
      tenantId: "tn_zero",
      name: "",
      mensalidade: 0,
      amount: 0,
      rateType: "PERCENT" as const,
      rate: 0,
      phaseIndex: 0,
    }
    expect(parseLinesSnapshot([zerada])).toEqual([zerada])
  })
})

describe("isMonthlyCommissionLine — descarte campo a campo", () => {
  it("aceita as duas formas canonicas do motor", () => {
    expect(isMonthlyCommissionLine(linhaPercent)).toBe(true)
    expect(isMonthlyCommissionLine(linhaFixed)).toBe(true)
  })

  it.each([
    ["tenantId ausente", (() => {
      const { tenantId: _tenantId, ...resto } = linhaPercent
      return resto
    })()],
    ["tenantId vazio", comCampo("tenantId", "")],
    ["tenantId numerico", comCampo("tenantId", 123)],
    ["tenantId null", comCampo("tenantId", null)],
    ["tenantId undefined explicito", comCampo("tenantId", undefined)],
  ])("descarta linha com %s", (_titulo, entrada) => {
    // Sem tenantId nao da para dizer de QUAL unidade e o dinheiro — a linha
    // nao pode virar uma coluna do CSV nem somar no BI.
    expect(isMonthlyCommissionLine(entrada)).toBe(false)
  })

  it.each([
    ["name ausente", (() => {
      const { name: _name, ...resto } = linhaPercent
      return resto
    })()],
    ["name numerico", comCampo("name", 42)],
    ["name null", comCampo("name", null)],
    ["name objeto", comCampo("name", { pt: "Unidade" })],
  ])("descarta linha com %s", (_titulo, entrada) => {
    expect(isMonthlyCommissionLine(entrada)).toBe(false)
  })

  it.each([
    ["mensalidade string numerica", comCampo("mensalidade", "239")],
    ["mensalidade null", comCampo("mensalidade", null)],
    ["mensalidade NaN", comCampo("mensalidade", Number.NaN)],
    ["mensalidade Infinity", comCampo("mensalidade", Number.POSITIVE_INFINITY)],
    ["mensalidade -Infinity", comCampo("mensalidade", Number.NEGATIVE_INFINITY)],
    ["mensalidade ausente", (() => {
      const { mensalidade: _m, ...resto } = linhaPercent
      return resto
    })()],
  ])("descarta linha com %s", (_titulo, entrada) => {
    // "239" viraria NaN em qualquer soma; NaN/Infinity contaminam o total do
    // relatorio inteiro. Melhor perder a linha do que publicar total quebrado.
    expect(isMonthlyCommissionLine(entrada)).toBe(false)
  })

  it.each([
    ["amount string numerica", comCampo("amount", "119.50")],
    ["amount null", comCampo("amount", null)],
    ["amount NaN", comCampo("amount", Number.NaN)],
    ["amount Infinity", comCampo("amount", Number.POSITIVE_INFINITY)],
    ["amount ausente", (() => {
      const { amount: _a, ...resto } = linhaPercent
      return resto
    })()],
  ])("descarta linha com %s", (_titulo, entrada) => {
    expect(isMonthlyCommissionLine(entrada)).toBe(false)
  })

  it.each([
    ["rateType em minusculas", comCampo("rateType", "percent")],
    ["rateType desconhecido", comCampo("rateType", "MIXED")],
    ["rateType null", comCampo("rateType", null)],
    ["rateType numerico", comCampo("rateType", 1)],
  ])("descarta linha com %s", (_titulo, entrada) => {
    // rateType fora do enum quebraria a decisao FIXED-vs-PERCENT, que e o que
    // separa "R$ por unidade" de "% da mensalidade" na coluna de percentual.
    expect(isMonthlyCommissionLine(entrada)).toBe(false)
  })

  it("aceita rateType ausente ou undefined (campo opcional)", () => {
    const { rateType: _rt, ...semRateType } = linhaPercent
    expect(isMonthlyCommissionLine(semRateType)).toBe(true)
    expect(isMonthlyCommissionLine(comCampo("rateType", undefined))).toBe(true)
  })

  it.each([
    ["rate string", comCampo("rate", "50")],
    ["rate null", comCampo("rate", null)],
    ["rate NaN", comCampo("rate", Number.NaN)],
    ["rate Infinity", comCampo("rate", Number.POSITIVE_INFINITY)],
  ])("descarta linha com %s", (_titulo, entrada) => {
    expect(isMonthlyCommissionLine(entrada)).toBe(false)
  })

  it("aceita rate ausente ou undefined (campo opcional)", () => {
    const { rate: _r, ...semRate } = linhaPercent
    expect(isMonthlyCommissionLine(semRate)).toBe(true)
    expect(isMonthlyCommissionLine(comCampo("rate", undefined))).toBe(true)
  })

  it.each([
    ["phaseIndex fracionario", comCampo("phaseIndex", 1.5)],
    ["phaseIndex string", comCampo("phaseIndex", "0")],
    ["phaseIndex null", comCampo("phaseIndex", null)],
    ["phaseIndex NaN", comCampo("phaseIndex", Number.NaN)],
  ])("descarta linha com %s", (_titulo, entrada) => {
    // phaseIndex indexa `phases[]` em monthly.ts: valor nao-inteiro nunca
    // resolveria uma fase real.
    expect(isMonthlyCommissionLine(entrada)).toBe(false)
  })

  it("aceita phaseIndex ausente ou undefined (campo opcional)", () => {
    const { phaseIndex: _p, ...semFase } = linhaPercent
    expect(isMonthlyCommissionLine(semFase)).toBe(true)
    expect(isMonthlyCommissionLine(comCampo("phaseIndex", undefined))).toBe(true)
  })

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["string", "tn_indicada_1"],
    ["numero", 119.5],
    ["boolean", true],
    ["array (linha nao pode ser lista)", [linhaPercent]],
  ])("descarta valor %s no lugar de um objeto de linha", (_titulo, entrada) => {
    expect(isMonthlyCommissionLine(entrada)).toBe(false)
  })

  it("ignora campos extras desconhecidos em vez de descartar a linha", () => {
    // Tolerancia deliberada: uma versao futura do motor pode gravar campos a
    // mais e as versoes antigas do app nao podem perder o dinheiro por isso.
    expect(isMonthlyCommissionLine({ ...linhaPercent, campoNovo: "x" })).toBe(true)
  })
})

describe("parseLinesSnapshot — entrada nao-array e mistura", () => {
  it.each([
    ["null (coluna Json? vazia no banco)", null],
    ["undefined (select sem o campo)", undefined],
    ["objeto", { tenantId: "tn_1" }],
    ["string JSON nao desserializada", '[{"tenantId":"tn_1"}]'],
    ["string vazia", ""],
    ["numero", 0],
    ["boolean", false],
  ])("devolve [] sem lancar para %s", (_titulo, entrada) => {
    // Cada consumidor tem caminho de fallback para o agregado do mes quando a
    // lista vem vazia — mas so se o parser devolver [] em vez de explodir no
    // meio da geracao do PDF/CSV.
    expect(() => parseLinesSnapshot(entrada)).not.toThrow()
    expect(parseLinesSnapshot(entrada)).toEqual([])
  })

  it("devolve [] para array vazio e para array 100% corrompido", () => {
    expect(parseLinesSnapshot([])).toEqual([])
    expect(parseLinesSnapshot([null, "lixo", 7, { foo: "bar" }])).toEqual([])
  })

  it("mantem so as linhas boas, na ordem original", () => {
    const snapshot: unknown[] = [
      null,
      linhaPercent,
      comCampo("tenantId", ""), // descartada
      "lixo",
      linhaFixed,
      comCampo("amount", Number.NaN), // descartada
    ]
    const resultado = parseLinesSnapshot(snapshot)
    expect(resultado).toEqual([linhaPercent, linhaFixed])
    // Ordem importa: o CSV e o demonstrativo listam as unidades na ordem do
    // snapshot, e o admin confere linha a linha contra o extrato.
    expect(resultado.map((l) => l.tenantId)).toEqual([
      "tn_indicada_1",
      "tn_indicada_2",
    ])
  })

  it("nao soma nem inventa nada: a soma das linhas boas ignora as descartadas", () => {
    // Nenhuma coercao silenciosa para 0: a linha ruim some, ela nao entra
    // valendo zero (o que mascararia a corrupcao com um numero plausivel).
    const total = parseLinesSnapshot([
      linhaPercent,
      comCampo("amount", "999999"),
      linhaFixed,
    ]).reduce((acc, l) => acc + l.amount, 0)
    expect(total).toBe(159.5)
  })

  it("nao muta o snapshot recebido", () => {
    const snapshot: unknown[] = [linhaPercent, "lixo"]
    parseLinesSnapshot(snapshot)
    expect(snapshot).toHaveLength(2)
  })
})

describe("linePercent — percentual so existe em faixa PERCENT", () => {
  it("devolve o percentual da faixa em PERCENT", () => {
    expect(linePercent(linhaPercent)).toBe(50)
  })

  it("devolve null em FIXED mesmo com rate preenchido", () => {
    // Em FIXED o `rate` e R$ por unidade (aqui R$ 40). Publicar 40 numa coluna
    // "%" leria "40% de comissao" — erro de ordem de grandeza no relatorio.
    expect(linhaFixed.rate).toBe(40)
    expect(linePercent(linhaFixed)).toBeNull()
  })

  it("devolve null quando a linha nao tem rateType (snapshot legado)", () => {
    const { rateType: _rt, ...semRateType } = linhaPercent
    expect(linePercent(semRateType)).toBeNull()
  })

  it("devolve null quando rateType e PERCENT mas rate nao foi gravado", () => {
    const { rate: _r, ...semRate } = linhaPercent
    expect(linePercent(semRate)).toBeNull()
  })

  it("nunca devolve o percentual agregado 'misto': a linha carrega o rate da PROPRIA fase", () => {
    // Sentinela de plano multi-fase: quando fases diferentes contribuem no mes,
    // monthly.ts grava `rate = 0` no TOPO da comissao para sinalizar "misto" as
    // telas. Esse 0 nunca desce para as linhas — cada linha guarda o
    // `bracket.value` da sua propria fase. E por isso que os consumidores podem
    // abrir a quebra por unidade em vez de publicar o agregado sem sentido.
    const fechamentoMisto = parseLinesSnapshot([
      { ...linhaPercent, phaseIndex: 0, rate: 50 },
      { ...linhaFixed, phaseIndex: 1, rate: 40 },
    ])
    expect(fechamentoMisto.map((l) => linePercent(l))).toEqual([50, null])
  })

  it("faixa 0% real devolve 0 e o consumidor publica '0%' (0 nao e ausencia)", () => {
    // ATENCAO — comportamento sensivel, pinado de proposito.
    // `rate: 0` NUMA LINHA nao e o sentinela "misto" (esse vive no topo da
    // comissao, ver teste acima): e uma faixa de 0% de fato, que ./rules aceita
    // como "faixa que nao paga". Nesse caso o helper devolve 0, e como os
    // consumidores usam `?? "-"` (que nao captura 0), o relatorio publica "0%"
    // com amount 0 — verdadeiro e conferivel, nao dinheiro fabricado.
    // Se algum dia a decisao for esconder a linha de 0%, a mudanca e no helper
    // (0 -> null) e ESTE teste tem de mudar junto.
    const faixaZero: MonthlyCommissionLine = {
      ...linhaPercent,
      amount: 0,
      rate: 0,
    }
    const p = linePercent(faixaZero)
    expect(p).toBe(0)
    expect(p).not.toBeNull()
    // Consequencia exata na celula do CSV / do demonstrativo:
    expect(p ?? "-").toBe(0)
  })
})
