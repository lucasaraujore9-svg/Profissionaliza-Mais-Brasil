/**
 * Régua da inadimplência da unidade: quando SUSPENDER, quando AVISAR e quando
 * CANCELAR.
 *
 * Módulo PURO (sem Prisma, sem rede) porque as três decisões precisam sair do
 * MESMO relógio. A suspensão já existia dentro do cron; o cancelamento
 * automático nasceria como um segundo cálculo de "há quantos dias está vencida"
 * e, no primeiro ajuste, as duas metades divergiriam — a unidade seria cancelada
 * antes de ser suspensa, ou avisada depois de já ter sido cancelada.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O RELÓGIO É O VENCIMENTO, NÃO A SUSPENSÃO
 *
 * "7 dias inadimplente" conta a partir do `dueDate` da cobrança mais antiga em
 * aberto — o mesmo marco que a suspensão em D+3 usa. Contar a partir da
 * suspensão faria o prazo depender de QUANDO o cron rodou (a cada 6h) e de
 * falhas de webhook: uma unidade suspensa com atraso pelo sweep ganharia dias de
 * vida a mais que a suspensa na hora pelo webhook.
 *
 * Dia CIVIL brasileiro (`daysUntilBrDay`): o servidor roda em UTC e, sem isso,
 * a virada do dia sairia 3h adiantada — cancelaria com 6 dias e 21 horas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O CANCELAMENTO NUNCA VEM ANTES DA SUSPENSÃO
 *
 * `cancelAfterDays = max(7, gracePeriodDays)`. A carência por unidade
 * (`cancellationPolicy.gracePeriodDays`) pode ser maior que 7 — há uma unidade
 * em produção com 15. Sem o `max`, ela seria CANCELADA no dia 7 sem nunca ter
 * sido suspensa: a unidade passaria de "vendendo normalmente" para "cancelada"
 * sem o degrau intermediário que existe justamente para ela reagir.
 */
import { daysUntilBrDay } from "@/lib/dates"

const MS_PER_DAY = 86_400_000

/** Dias de atraso até a unidade ser suspensa, quando ela não define os seus. */
export const DEFAULT_SUSPEND_GRACE_DAYS = 3

/** Dias de atraso até a unidade ser CANCELADA automaticamente. */
export const AUTO_CANCEL_OVERDUE_DAYS = 7

/** Quantos dias ANTES do cancelamento sai o último aviso (D+5 no padrão). */
export const CANCEL_WARNING_LEAD_DAYS = 2

/** Status da unidade em que o relógio da inadimplência corre. */
export const OVERDUE_TENANT_STATUSES = ["ACTIVE", "PENDING", "SUSPENDED"] as const

export interface CancellationPolicy {
  /** Dias de atraso até suspender. */
  gracePeriodDays?: number
  /** Manter os alunos com acesso quando a unidade for cancelada. */
  keepStudentsActive?: boolean
  notifyStudents?: boolean
  /**
   * `false` desliga o cancelamento automático DESTA unidade — a saída para
   * negociação em curso, sem precisar desligar a regra para a rede inteira.
   * Ausente/`true` = a regra vale.
   */
  autoCancel?: boolean
  /** Substitui os 7 dias padrão nesta unidade (nunca abaixo da carência). */
  autoCancelAfterDays?: number
}

export interface OverdueRuler {
  suspendAfterDays: number
  cancelAfterDays: number
  /** A partir de quantos dias de atraso sai o aviso final. */
  warnAfterDays: number
  autoCancel: boolean
}

function positiveInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  const rounded = Math.trunc(value)
  return rounded >= 0 ? rounded : null
}

/** Lê o JSON solto de `Tenant.cancellationPolicy` sem confiar no formato. */
export function readCancellationPolicy(value: unknown): CancellationPolicy | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as CancellationPolicy
}

export function resolveOverdueRuler(cancellationPolicy: unknown): OverdueRuler {
  const policy = readCancellationPolicy(cancellationPolicy)

  const suspendAfterDays =
    positiveInt(policy?.gracePeriodDays) ?? DEFAULT_SUSPEND_GRACE_DAYS
  // `max` e não `??`: ver o cabeçalho — cancelar antes de suspender pularia o
  // degrau que dá à unidade a chance de reagir.
  const cancelAfterDays = Math.max(
    positiveInt(policy?.autoCancelAfterDays) ?? AUTO_CANCEL_OVERDUE_DAYS,
    suspendAfterDays,
  )

  return {
    suspendAfterDays,
    cancelAfterDays,
    warnAfterDays: Math.max(cancelAfterDays - CANCEL_WARNING_LEAD_DAYS, 0),
    autoCancel: policy?.autoCancel !== false,
  }
}

/** Dias de atraso da cobrança, em dia civil brasileiro. Negativo = a vencer. */
export function overdueDays(dueDate: Date, now: Date = new Date()): number {
  const remaining = daysUntilBrDay(dueDate, now)
  // `-0` no dia do vencimento sujaria log e comparação de igualdade.
  return remaining === 0 ? 0 : -remaining
}

/** Data em que esta cobrança leva a unidade ao cancelamento. */
export function cancelDateFor(dueDate: Date, ruler: OverdueRuler): Date {
  return new Date(dueDate.getTime() + ruler.cancelAfterDays * MS_PER_DAY)
}

export type OverdueAction = "cancel" | "suspend" | "none"

/**
 * A ação PRINCIPAL desta passada. O aviso é decidido à parte
 * (`shouldWarnCancellation`) de propósito: uma unidade que cruza a suspensão e a
 * janela de aviso na mesma execução precisa das duas coisas, e um único
 * `switch` obrigaria a escolher — deixando o aviso final para uma execução
 * seguinte que talvez já a encontre cancelada.
 */
export function overdueAction(input: {
  ageDays: number
  status: string
  ruler: OverdueRuler
}): OverdueAction {
  const { ageDays, status, ruler } = input
  if (status === "CANCELLED") return "none"
  if (ruler.autoCancel && ageDays >= ruler.cancelAfterDays) return "cancel"
  if (status !== "SUSPENDED" && ageDays >= ruler.suspendAfterDays) return "suspend"
  return "none"
}

/** Janela do aviso final: [warnAfterDays, cancelAfterDays). */
export function shouldWarnCancellation(ageDays: number, ruler: OverdueRuler): boolean {
  if (!ruler.autoCancel) return false
  return ageDays >= ruler.warnAfterDays && ageDays < ruler.cancelAfterDays
}

/**
 * Chave de idempotência do aviso final em `TenantPaymentReminder`.
 *
 * O `offsetDays` daquela tabela é "dias entre o disparo e o vencimento", com os
 * lembretes PRÉ-vencimento em 5/2/0. NEGATIVO = depois do vencimento, então o
 * aviso do dia 5 de atraso é `-5`. Reusar a tabela evita uma migration só para
 * guardar "já avisei" e herda a chave primária composta, que é o que impede o
 * aviso duplicado quando o pg_net re-tenta a chamada.
 */
export function cancelWarningOffset(ruler: OverdueRuler): number {
  return -ruler.warnAfterDays
}

/** "22/08/2026" — `dueDate` é meia-noite UTC do dia civil; formatar em UTC. */
export function formatBrDate(date: Date): string {
  return date.toLocaleDateString("pt-BR", { timeZone: "UTC" })
}

export function money(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

/** Frase que a suspensão e o aviso final compartilham. */
export function cancellationNoticeLine(dueDate: Date, ruler: OverdueRuler): string {
  return `Se a mensalidade não for paga até ${formatBrDate(
    cancelDateFor(dueDate, ruler),
  )}, sua unidade será CANCELADA automaticamente (${ruler.cancelAfterDays} dias de atraso).`
}
