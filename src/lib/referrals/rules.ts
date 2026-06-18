/**
 * Motor de comissao de indicacao por FAIXAS (configuravel) — coexiste com o
 * motor legado (% por mensalidade, por pagamento). Aqui ficam apenas os tipos e
 * a resolucao da regra (override por unidade -> padrao global) + selecao da
 * faixa pela contagem. O calculo do valor mensal vive em ./monthly.ts.
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

export interface CommissionRule {
  mode: CommissionMode
  bracketBasis: CommissionBracketBasis
  rateType: CommissionRateType
  payoutBase: CommissionPayoutBase
  brackets: CommissionBracket[]
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

/**
 * Resolve a regra efetiva de um indicador: cada campo do override (Tenant) tem
 * prioridade; quando null, cai no padrao global (SystemSettings). As faixas do
 * override so sao usadas se houver pelo menos uma valida; senao usa as globais.
 */
export function resolveCommissionRule(
  override: TenantCommissionOverride | null,
  global: GlobalCommissionConfig,
): CommissionRule {
  const overrideBrackets = override ? parseBrackets(override.commissionBrackets) : []
  const globalBrackets = parseBrackets(global.commissionBrackets)
  return {
    mode: override?.commissionMode ?? global.commissionMode,
    bracketBasis: override?.commissionBracketBasis ?? global.commissionBracketBasis,
    rateType: override?.commissionRateType ?? global.commissionRateType,
    payoutBase: override?.commissionPayoutBase ?? global.commissionPayoutBase,
    brackets: overrideBrackets.length > 0 ? overrideBrackets : globalBrackets,
  }
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
