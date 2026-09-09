/**
 * Por que uma unidade indicada NAO entrou na conta do mes.
 *
 * O relatorio do indicador (/admin/indicacoes/[id]) existe para o financeiro
 * CONFERIR o valor antes de pagar. Listar so quem entrou nao permite conferir
 * nada: a pergunta que aparece na mesa e sempre "e a fulana, por que nao
 * contou?".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTE MODULO NAO DECIDE NADA. Quem entrou na conta e o `linesSnapshot` gravado
 * pelo motor no fechamento — fonte unica, congelada, a mesma que virou dinheiro.
 * Aqui so se EXPLICA a ausencia de quem ficou de fora. Se a explicacao um dia
 * divergir do motor, o valor pago continua correto e o defeito e de texto, nao
 * de dinheiro. Por isso `null` (nao sei dizer) e uma resposta valida e nunca se
 * inventa um motivo plausivel.
 *
 * A ordem de avaliacao espelha a de `computeForReferrer` em ./monthly.ts —
 * a primeira condicao que barra e a que se mostra, porque e a que o motor
 * aplicou primeiro.
 */

export type MotivoForaDaConta =
  | "CORTESIA"
  | "CANCELADA"
  | "NUNCA_PAGOU"
  | "ENTROU_DEPOIS"
  | "SEM_PAGAMENTO_NO_MES"
  | "FORA_DA_BASE"

export const MOTIVO_LABEL: Record<MotivoForaDaConta, string> = {
  CORTESIA: "Cortesia (mensalidade R$ 0)",
  CANCELADA: "Contrato cancelado",
  NUNCA_PAGOU: "Nunca pagou nenhuma mensalidade",
  ENTROU_DEPOIS: "Entrou depois desta competência",
  SEM_PAGAMENTO_NO_MES: "Fora do ar e sem pagamento no mês",
  FORA_DA_BASE: "Fora da base de pagamento da regra",
}

export interface UnidadeFatos {
  /** Mensalidade de HOJE. 0 = cortesia, que nunca gera comissao. */
  planValue: number
  status: string
  /** Ja pagou ao menos uma mensalidade, alguma vez (predicado do lifecycle). */
  everPaid: boolean
  /** Recebeu mensalidade DENTRO da competencia apurada. */
  paidInPeriod: boolean
  /**
   * Mes em que a unidade entrou no programa, como indice absoluto (ano*12+mes).
   * COALESCE(commissionPlanStartedAt, activatedAt, createdAt) — a mesma ancora
   * do motor.
   */
  entryMonthIndex: number
}

/**
 * `null` quando a unidade ESTA na conta (nada a explicar) ou quando nenhuma das
 * condicoes conhecidas a barra — nesse caso o relatorio mostra "—" em vez de
 * chutar.
 */
export function motivoForaDaConta(
  fatos: UnidadeFatos,
  periodMonthIndex: number,
  naConta: boolean,
): MotivoForaDaConta | null {
  if (naConta) return null
  if (fatos.planValue <= 0) return "CORTESIA"
  if (fatos.status === "CANCELLED") return "CANCELADA"
  if (!fatos.everPaid) return "NUNCA_PAGOU"
  if (fatos.entryMonthIndex > periodMonthIndex) return "ENTROU_DEPOIS"
  if (fatos.status !== "ACTIVE" && !fatos.paidInPeriod) {
    return "SEM_PAGAMENTO_NO_MES"
  }
  return "FORA_DA_BASE"
}

/** Indice absoluto de mes (ano*12+mes), em UTC — o mesmo do motor. */
export function monthIndex(d: Date): number {
  return d.getUTCFullYear() * 12 + d.getUTCMonth()
}

/** Indice absoluto de uma competencia "AAAA-MM". */
export function periodMonthIndex(period: string): number | null {
  const m = /^(\d{4})-(\d{2})$/.exec(period)
  if (!m) return null
  const month = Number(m[2])
  if (month < 1 || month > 12) return null
  return Number(m[1]) * 12 + (month - 1)
}
