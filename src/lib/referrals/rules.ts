/**
 * Tipos e primitivas da regra de comissao de indicacao: parsing/normalizacao das
 * faixas e das fases, e selecao da faixa pela contagem.
 *
 * A RESOLUCAO da regra efetiva (override da unidade -> padrao global -> fallback)
 * NAO mora aqui: mora em ./effective-rule.ts, que e a fonte unica consumida pelo
 * motor e pela UI. Este arquivo ja teve uma segunda implementacao dessa
 * resolucao (`resolveCommissionRule`/`resolveEffectivePhases`); ela foi removida
 * na unificacao justamente porque duas implementacoes da mesma decisao foi o que
 * produziu o bug de pagar 10% para quem tinha 50% configurado.
 *
 * O calculo do valor mensal vive em ./monthly.ts.
 *
 * Modelo (definido com o cliente):
 *  - A FAIXA e escolhida pela contagem: novas revendas indicadas no mes
 *    (NEW_REFERRALS_MONTH) OU nº de unidades ativas (ACTIVE_UNITS).
 *  - O valor da faixa e FIXO (R$ por unidade) ou PERCENTUAL (% da mensalidade).
 *  - A base de pagamento (sobre quais unidades o valor incide) e: TODAS as
 *    ativas (ALL_ACTIVE) OU so as indicadas naquele mes (REFERRED_THIS_MONTH).
 */
import type {
  CommissionMode,
  CommissionBracketBasis,
  CommissionRateType,
  CommissionPayoutBase,
} from "@prisma/client"

export interface CommissionBracket {
  /**
   * Limite superior (inclusive) da contagem para esta faixa. `null` = faixa
   * final, sem teto ("daqui em diante").
   */
  upTo: number | null
  /** Valor da faixa: R$ por unidade (FIXED) ou % da mensalidade (PERCENT). */
  value: number
}

/** Campos da regra global (SystemSettings). Todos definidos (com default no banco). */
export interface GlobalCommissionConfig {
  commissionMode: CommissionMode
  commissionBracketBasis: CommissionBracketBasis
  commissionRateType: CommissionRateType
  commissionPayoutBase: CommissionPayoutBase
  commissionBrackets: unknown
}

/** Override por unidade (Tenant). Cada campo null => herda o global. */
export interface TenantCommissionOverride {
  commissionMode: CommissionMode | null
  commissionBracketBasis: CommissionBracketBasis | null
  commissionRateType: CommissionRateType | null
  commissionPayoutBase: CommissionPayoutBase | null
  commissionBrackets: unknown
}

/**
 * Normaliza/valida um JSON (do banco ou de um form) numa lista de faixas.
 * Descarta entradas invalidas; retorna [] se nada sobrar. Ordena por `upTo`
 * crescente com a faixa "sem teto" (null) por ultimo.
 */
export function parseBrackets(value: unknown): CommissionBracket[] {
  if (!Array.isArray(value)) return []
  const out: CommissionBracket[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue
    const obj = raw as Record<string, unknown>
    const valueNum = Number(obj.value)
    if (!Number.isFinite(valueNum) || valueNum < 0) continue
    let upTo: number | null
    if (obj.upTo === null || obj.upTo === undefined || obj.upTo === "") {
      upTo = null
    } else {
      const n = Number(obj.upTo)
      if (!Number.isFinite(n) || n < 1) continue
      upTo = Math.floor(n)
    }
    out.push({ upTo, value: valueNum })
  }
  return sortBrackets(out)
}

/** Ordena por upTo crescente; faixa final (null) por ultimo. */
export function sortBrackets(brackets: CommissionBracket[]): CommissionBracket[] {
  return [...brackets].sort((a, b) => {
    if (a.upTo === null) return 1
    if (b.upTo === null) return -1
    return a.upTo - b.upTo
  })
}

// ===========================================================================
// Plano de comissao MULTI-FASE (MONTHLY_TIERED).
//
// Um plano e uma lista ordenada de FASES. Cada fase vale por um intervalo de
// meses contados desde a entrada do indicador no programa
// (Tenant.commissionPlanStartedAt ?? createdAt). A fase ativa num mes de
// apuracao define a regra (rateType/bracketBasis/payoutBase/brackets) daquele
// mes. A ultima fase pode ter `durationMonths: null` ("em diante").
//
// Ex.: [{3m, FIXED, ...}, {null, PERCENT, ...}] => meses 0..2 valor fixo;
//      do 4o mes (indice 3) em diante, percentual.
// ===========================================================================

/** Uma fase do plano: a regra de faixas + por quantos meses ela vale. */
export interface CommissionPhase {
  /**
   * Duracao da fase em meses. `null` => fase final, vale "em diante". Apenas a
   * ultima fase pode ser null.
   */
  durationMonths: number | null
  rateType: CommissionRateType
  bracketBasis: CommissionBracketBasis
  payoutBase: CommissionPayoutBase
  brackets: CommissionBracket[]
}

const RATE_TYPES: CommissionRateType[] = ["FIXED", "PERCENT"]
const BRACKET_BASES: CommissionBracketBasis[] = ["NEW_REFERRALS_MONTH", "ACTIVE_UNITS"]
const PAYOUT_BASES: CommissionPayoutBase[] = [
  "ALL_ACTIVE",
  "REFERRED_THIS_MONTH",
  "PAID_THIS_MONTH",
]

/**
 * O que faz a fase avancar.
 *
 *  - `months`: idade da unidade indicada em meses de calendario (padrao, e o
 *    comportamento historico). `durationMonths` = numero de MESES.
 *  - `paidInvoices`: ordem da FATURA paga da unidade. `durationMonths` passa a
 *    contar FATURAS: uma fase de duracao 1 vale so para a 1a fatura paga.
 *
 * A distincao existe porque "50% da primeira mensalidade" nao e a mesma coisa
 * que "50% no primeiro mes": uma unidade que atrasa e so paga a 1a fatura no 3o
 * mes de vida continua tendo direito ao percentual de entrada.
 */
export type CommissionClock = "months" | "paidInvoices"

const CLOCKS: CommissionClock[] = ["months", "paidInvoices"]

/** Ajustes do plano que valem para TODAS as fases (nao por fase). */
export interface CommissionPlanSettings {
  clock: CommissionClock
  /**
   * Data limite (INCLUSIVA) do pagamento para as fases promocionais valerem.
   * Uma fatura paga depois disso cai direto na fase final, mesmo sendo a 1a da
   * unidade. `null` = sem janela (promocao sem prazo).
   *
   * So tem efeito com `clock: "paidInvoices"` — e uma regra sobre a data de
   * PAGAMENTO de cada fatura, e o relogio por meses nao enxerga fatura.
   */
  promoPaidUntil: Date | null
}

export const DEFAULT_PLAN_SETTINGS: CommissionPlanSettings = {
  clock: "months",
  promoPaidUntil: null,
}

/**
 * Le os ajustes de topo do plano. Separado de `parsePlan` de proposito: os
 * chamadores que so querem as fases seguem intactos, e um plano antigo (sem
 * estes campos) resolve para o comportamento historico.
 */
export function parsePlanSettings(value: unknown): CommissionPlanSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_PLAN_SETTINGS
  }
  const obj = value as Record<string, unknown>

  const clock = CLOCKS.includes(obj.clock as CommissionClock)
    ? (obj.clock as CommissionClock)
    : "months"

  let promoPaidUntil: Date | null = null
  if (typeof obj.promoPaidUntil === "string" && obj.promoPaidUntil.trim() !== "") {
    const d = new Date(obj.promoPaidUntil)
    // Data invalida e ignorada: uma janela que nao da para interpretar nao pode
    // silenciosamente derrubar todo mundo para a fase final.
    if (!Number.isNaN(d.getTime())) promoPaidUntil = d
  } else if (obj.promoPaidUntil instanceof Date && !Number.isNaN(obj.promoPaidUntil.getTime())) {
    promoPaidUntil = obj.promoPaidUntil
  }

  return { clock, promoPaidUntil }
}

/**
 * Inverso de `parsePlanSettings`: devolve so os ajustes que saem do padrao, no
 * formato que vai para o JSON do plano. Usado por quem RECOPIA um plano
 * existente (ex.: o congelamento de escopo NEW_ONLY), para que os ajustes nao
 * se percam no caminho.
 */
export function serializePlanSettings(
  settings: CommissionPlanSettings,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (settings.clock !== DEFAULT_PLAN_SETTINGS.clock) out.clock = settings.clock
  if (settings.promoPaidUntil) {
    out.promoPaidUntil = settings.promoPaidUntil.toISOString()
  }
  return out
}

/**
 * Normaliza/valida um JSON num plano (lista de fases). Aceita tanto o objeto
 * `{ phases: [...] }` quanto um array cru de fases. Descarta fases invalidas
 * (sem faixas validas, enums fora do dominio). Garante que so a ULTIMA fase
 * tenha `durationMonths: null` — fases null intermediarias viram a final
 * (truncando o resto). Retorna [] se nada sobrar (=> sem plano multi-fase).
 */
export function parsePlan(value: unknown): CommissionPhase[] {
  const rawArr = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as Record<string, unknown>).phases)
      ? ((value as Record<string, unknown>).phases as unknown[])
      : null
  if (!rawArr) return []

  const out: CommissionPhase[] = []
  for (const raw of rawArr) {
    if (!raw || typeof raw !== "object") continue
    const obj = raw as Record<string, unknown>
    const brackets = parseBrackets(obj.brackets)
    if (brackets.length === 0) continue // fase sem faixa nao paga nada — descarta

    const rateType = RATE_TYPES.includes(obj.rateType as CommissionRateType)
      ? (obj.rateType as CommissionRateType)
      : "FIXED"
    const bracketBasis = BRACKET_BASES.includes(obj.bracketBasis as CommissionBracketBasis)
      ? (obj.bracketBasis as CommissionBracketBasis)
      : "NEW_REFERRALS_MONTH"
    const payoutBase = PAYOUT_BASES.includes(obj.payoutBase as CommissionPayoutBase)
      ? (obj.payoutBase as CommissionPayoutBase)
      : "ALL_ACTIVE"

    let durationMonths: number | null
    if (obj.durationMonths === null || obj.durationMonths === undefined || obj.durationMonths === "") {
      durationMonths = null
    } else {
      const n = Number(obj.durationMonths)
      if (!Number.isFinite(n) || n < 1) continue
      durationMonths = Math.floor(n)
    }
    out.push({ durationMonths, rateType, bracketBasis, payoutBase, brackets })
  }

  // So a ultima fase pode ser "em diante". Se uma fase intermediaria veio null,
  // ela vira a final e o resto e descartado (plano malformado defensivamente).
  const firstOpen = out.findIndex((p) => p.durationMonths === null)
  const trimmed = firstOpen === -1 ? out : out.slice(0, firstOpen + 1)
  // Demais fases null (que nao a final) ja foram cortadas; nada mais a fazer.
  return trimmed
}

/**
 * Meses decorridos (inteiros, >= 0) entre a ancora do plano e o mes de
 * apuracao. Conta meses de CALENDARIO: a unidade que entrou em jan e apurada
 * em jan => 0; fev => 1; etc. `periodStart` deve ser o 1o dia (UTC) do mes.
 */
export function monthsInProgram(anchor: Date, periodStart: Date): number {
  const a = anchor.getUTCFullYear() * 12 + anchor.getUTCMonth()
  const p = periodStart.getUTCFullYear() * 12 + periodStart.getUTCMonth()
  return Math.max(0, p - a)
}

/**
 * Seleciona a fase ativa para `elapsed` unidades de relogio ja decorridas.
 * Caminha as fases somando as duracoes; a 1a fase cujo intervalo cobre
 * `elapsed` vence. A fase final (durationMonths null) cobre o resto. `null` se
 * vazio.
 *
 * `elapsed` e MESES quando o plano usa `clock: "months"` e FATURAS JA PAGAS
 * quando usa `clock: "paidInvoices"` — a aritmetica e a mesma, muda so o que
 * esta sendo contado (ver `CommissionClock`).
 */
export function resolvePhase(
  phases: CommissionPhase[],
  elapsed: number,
): { index: number; phase: CommissionPhase } | null {
  if (phases.length === 0) return null
  let acc = 0
  for (let i = 0; i < phases.length; i++) {
    const d = phases[i].durationMonths
    if (d === null) return { index: i, phase: phases[i] }
    if (elapsed < acc + d) return { index: i, phase: phases[i] }
    acc += d
  }
  // Alem de todas as fases finitas e sem fase "em diante": usa a ultima.
  return { index: phases.length - 1, phase: phases[phases.length - 1] }
}

/**
 * Seleciona a faixa aplicavel para uma contagem. Retorna o indice (0-based, na
 * lista ordenada) e o valor. `null` se nao ha faixas configuradas.
 *
 * Regra: a 1a faixa cujo `upTo >= count` (ou `upTo === null`). Ex.: faixas
 * [≤10→100, ≤30→150, ∞→200]; count 0..10 => 100; 11..30 => 150; 31+ => 200.
 */
export function resolveBracket(
  brackets: CommissionBracket[],
  count: number,
): { index: number; value: number } | null {
  const sorted = sortBrackets(brackets)
  if (sorted.length === 0) return null
  for (let i = 0; i < sorted.length; i++) {
    const b = sorted[i]
    if (b.upTo === null || count <= b.upTo) {
      return { index: i, value: b.value }
    }
  }
  // count acima de todas as faixas finitas e sem faixa "sem teto": usa a ultima.
  return { index: sorted.length - 1, value: sorted[sorted.length - 1].value }
}
