/**
 * Regras escalonadas de comissão por indicação, definidas POR UNIDADE INDICADA.
 *
 * O percentual da comissão que o indicador recebe varia conforme há quanto
 * tempo a unidade indicada está ativa. Ex.: "primeiros 6 meses = 50%, depois
 * 20% para sempre" → [{ untilMonth: 6, percent: 50 }, { untilMonth: null, percent: 20 }].
 *
 * A contagem é por MÊS DE CALENDÁRIO desde a ativação da unidade
 * (Tenant.activatedAt, com fallback para createdAt). O 1º mês de vida é o mês 1.
 *
 * Quando a unidade não tem escala configurada (null/empty), o cálculo cai no
 * `referralPercent` individual ou no padrão global (lógica em commission.ts).
 */

export interface ReferralTier {
  /**
   * Limite superior (inclusive, 1-based) de meses desde a ativação a que este
   * percentual se aplica. `null` significa "deste ponto em diante" (sem teto).
   */
  untilMonth: number | null
  /** Percentual da comissão (0–100). */
  percent: number
}

/**
 * Normaliza/valida um valor JSON (vindo do banco ou de um form) numa lista de
 * tiers. Descarta entradas inválidas; retorna null se nada sobrar.
 */
export function parseReferralTiers(value: unknown): ReferralTier[] | null {
  if (!Array.isArray(value)) return null
  const tiers: ReferralTier[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue
    const obj = raw as Record<string, unknown>
    const percentNum = Number(obj.percent)
    if (!Number.isFinite(percentNum) || percentNum < 0 || percentNum > 100) {
      continue
    }
    let untilMonth: number | null
    if (obj.untilMonth === null || obj.untilMonth === undefined) {
      untilMonth = null
    } else {
      const m = Number(obj.untilMonth)
      if (!Number.isFinite(m) || m < 1) continue
      untilMonth = Math.floor(m)
    }
    tiers.push({ untilMonth, percent: percentNum })
  }
  return tiers.length > 0 ? sortTiers(tiers) : null
}

/** Ordena por untilMonth crescente, com o tier "em diante" (null) por último. */
export function sortTiers(tiers: ReferralTier[]): ReferralTier[] {
  return [...tiers].sort((a, b) => {
    if (a.untilMonth === null) return 1
    if (b.untilMonth === null) return -1
    return a.untilMonth - b.untilMonth
  })
}

/**
 * Meses de calendário COMPLETOS decorridos de `activatedAt` até `at`.
 * Ex.: ativou 10/01, em 09/02 = 0 meses; em 10/02 = 1 mês. Nunca negativo.
 */
export function monthsSinceActivation(activatedAt: Date, at: Date): number {
  let months =
    (at.getUTCFullYear() - activatedAt.getUTCFullYear()) * 12 +
    (at.getUTCMonth() - activatedAt.getUTCMonth())
  if (at.getUTCDate() < activatedAt.getUTCDate()) months -= 1
  return months < 0 ? 0 : months
}

/**
 * Resolve o percentual efetivo da escala para um pagamento ocorrido em `at`.
 *
 * @returns o percentual do tier aplicável, ou `null` se não há escala (o caller
 *          então usa referralPercent / padrão global).
 */
export function resolveTierPercent(
  tiers: ReferralTier[] | null,
  activatedAt: Date | null,
  at: Date,
): number | null {
  if (!tiers || tiers.length === 0) return null
  const sorted = sortTiers(tiers)
  const elapsed = activatedAt ? monthsSinceActivation(activatedAt, at) : 0
  const monthIndex = elapsed + 1 // 1-based: 1º mês de vida = mês 1
  for (const t of sorted) {
    if (t.untilMonth === null || monthIndex <= t.untilMonth) return t.percent
  }
  // monthIndex além de todos os tiers finitos e sem tier "em diante":
  // mantém o último percentual conhecido.
  return sorted[sorted.length - 1]?.percent ?? null
}
