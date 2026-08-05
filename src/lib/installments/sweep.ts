/**
 * Varredura diária do carnê (cron `sweep-boleto-installments`):
 *   A. Emite os boletos MP cujo vencimento entrou na janela de 7 dias (o MP não
 *      tem carnê nativo — cada boleto é emitido perto do vencimento).
 *   B. Marca parcelas vencidas como OVERDUE e bloqueia o acesso do aluno na
 *      plataforma (mesmo primitivo do auto-block por inadimplência). A parcela
 *      paga depois reativa via settleBoletoInstallment.
 *   C. Reconcilia a cota de aulas (trava proporcional ao pagamento) — rede de
 *      segurança dos gatilhos em tempo real. Ver `reconcilePaceGates`.
 *
 * Idempotente: A pula parcelas já emitidas; B pula matrículas já suspensas;
 * C só age na transição.
 */
import { prisma } from "@/lib/prisma"
import { blockStudentInEA } from "@/lib/students/plataforma-actions"
import { createNotification } from "@/lib/notifications"
import { swallow } from "@/lib/errors"
import { contextLogger } from "@/lib/logger"
import { evaluatePaceGate } from "@/lib/enrollment/pace"
import { PACE_GATED_WHERE } from "@/lib/enrollment/pace-gate"
import { generateMpBoletoForInstallment } from "./plan"
import { isOverdue, INSTALLMENT_REVEAL_WINDOW_DAYS } from "./schedule"

export interface SweepResult {
  /** Boletos MP emitidos nesta rodada. */
  generated: number
  /** Falhas de emissão (já logadas). */
  generateErrors: number
  /** Parcelas marcadas OVERDUE. */
  markedOverdue: number
  /** Matrículas suspensas (aluno bloqueado ou venda PENDING abandonada). */
  suspended: number
  /** Matrículas cuja cota de aulas mudou de estado nesta rodada. */
  paceReconciled: number
}

const GENERATE_BATCH = 200
const OVERDUE_BATCH = 500

export async function runBoletoInstallmentSweep(now: Date = new Date()): Promise<SweepResult> {
  const result: SweepResult = {
    generated: 0,
    generateErrors: 0,
    markedOverdue: 0,
    suspended: 0,
    paceReconciled: 0,
  }

  // ── A. Emitir boletos MP na janela de 7 dias ───────────────────────────────
  const windowEnd = new Date(now)
  windowEnd.setUTCDate(windowEnd.getUTCDate() + INSTALLMENT_REVEAL_WINDOW_DAYS)

  const toGenerate = await prisma.boletoInstallment.findMany({
    where: {
      gateway: "MP",
      status: "SCHEDULED",
      dueDate: { lte: windowEnd },
      enrollment: { status: { notIn: ["CANCELLED"] } },
    },
    select: { id: true },
    orderBy: { dueDate: "asc" },
    take: GENERATE_BATCH,
  })

  for (const row of toGenerate) {
    try {
      await generateMpBoletoForInstallment(row.id)
      result.generated++
    } catch {
      // Erro já logado dentro de generateMpBoletoForInstallment. Segue para os
      // demais — a próxima rodada re-tenta esta parcela.
      result.generateErrors++
    }
  }

  // ── B. Marcar OVERDUE + bloquear ───────────────────────────────────────────
  const candidates = await prisma.boletoInstallment.findMany({
    where: {
      status: { in: ["SCHEDULED", "GENERATED"] },
      dueDate: { lte: now },
      enrollment: { status: { in: ["PENDING", "ACTIVE"] } },
    },
    select: { id: true, enrollmentId: true, dueDate: true, status: true },
    take: OVERDUE_BATCH,
  })

  const overdue = candidates.filter((r) => isOverdue(r, now))
  for (const r of overdue) {
    await prisma.boletoInstallment
      .update({ where: { id: r.id }, data: { status: "OVERDUE" } })
      .catch(swallow("installments.sweep.mark_overdue"))
    result.markedOverdue++
  }

  const enrollmentIds = [...new Set(overdue.map((r) => r.enrollmentId))]
  for (const enrollmentId of enrollmentIds) {
    const suspended = await suspendForOverdue(enrollmentId)
    if (suspended) result.suspended++
  }

  // ── C. Reconciliar a cota de aulas ─────────────────────────────────────────
  result.paceReconciled = await reconcilePaceGates()

  return result
}

const PACE_BATCH = 500

/**
 * Rede de segurança da cota de aulas. Os gatilhos normais (sync de progresso,
 * webhook do LMS, parcela paga) cobrem o caso feliz; esta varredura pega o que
 * escapou:
 *   - corte na plataforma que falhou (EA/LMS fora do ar na hora);
 *   - matrícula que deveria destravar mas cujo webhook não chegou;
 *   - aluno que parou de abrir a área do aluno (na EA o progresso só vem do pull,
 *     então sem esta passada ninguém reavaliaria a matrícula dele);
 *   - interruptor desligado depois de já ter travado gente.
 *
 * Varre as JÁ TRAVADAS (índice `pace_blocked_at`, poucas linhas) e as matrículas
 * parceladas vivas cujo progresso passou da cota. `evaluatePaceGate` é idempotente
 * e nunca lança, então uma falha isolada não derruba a varredura.
 */
async function reconcilePaceGates(): Promise<number> {
  const candidates = await prisma.enrollment.findMany({
    where: {
      status: "ACTIVE",
      // `AND` explícito: dois `OR` soltos no mesmo nível são chaves do mesmo
      // objeto — o segundo sobrescreveria o primeiro.
      AND: [
        // "Está sob a regra da cota?" — plano próprio OU herdado da matrícula
        // que pagou. Gêmeo SQL de `isPaceGatedPlan`, travado por teste de
        // paridade. Sem o ramo herdado, a satélite de uma compra parcelada
        // (ONE_TIME, sem parcelas) ficava fora da varredura para sempre.
        PACE_GATED_WHERE,
        {
          OR: [
            { paceBlockedAt: { not: null } },
            { paceExemptAt: null, progressPercent: { gt: 0 } },
          ],
        },
      ],
    },
    select: { id: true },
    take: PACE_BATCH,
  })

  let reconciled = 0
  for (const row of candidates) {
    const res = await evaluatePaceGate(row.id)
    if (res?.changed) reconciled++
  }
  return reconciled
}

/**
 * Suspende a matrícula por inadimplência. Se ACTIVE (entrada já paga), bloqueia
 * o aluno na plataforma; se PENDING (nem a entrada foi paga), só marca SUSPENDED.
 * Retorna true se mudou o estado.
 */
async function suspendForOverdue(enrollmentId: string): Promise<boolean> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      id: true,
      status: true,
      studentId: true,
      tenantId: true,
      course: { select: { nome: true } },
      student: { select: { nome: true } },
    },
  })
  if (!enrollment) return false
  if (enrollment.status !== "ACTIVE" && enrollment.status !== "PENDING") return false

  if (enrollment.status === "ACTIVE") {
    try {
      await blockStudentInEA(enrollment.studentId)
    } catch (err) {
      contextLogger().error(
        { err, event: "installments.sweep.block_failed", enrollmentId },
        "bloqueio do aluno na plataforma falhou — mantém ACTIVE para re-tentar",
      )
      return false // não marca SUSPENDED se o bloqueio na plataforma falhou
    }
  }

  await prisma.enrollment.update({
    where: { id: enrollmentId },
    data: { status: "SUSPENDED" },
  })

  await createNotification({
    audience: "STUDENT",
    studentId: enrollment.studentId,
    level: "WARNING",
    title: `Parcela em atraso — ${enrollment.course.nome}`,
    body:
      enrollment.status === "ACTIVE"
        ? "Seu acesso foi suspenso por parcela vencida. Pague o boleto em aberto para reativar."
        : "Há um boleto vencido em aberto. Pague para liberar o acesso ao curso.",
    category: "payment",
    href: "/aluno/pagamentos",
  }).catch(swallow("installments.sweep.notify_student"))

  if (enrollment.tenantId) {
    await createNotification({
      audience: "TENANT",
      tenantId: enrollment.tenantId,
      level: "WARNING",
      title: `Parcela em atraso — ${enrollment.student.nome}`,
      body: `${enrollment.course.nome}: boleto vencido sem pagamento. Acesso do aluno suspenso.`,
      category: "payment",
      href: "/painel/financeiro",
    }).catch(swallow("installments.sweep.notify_tenant"))
  }

  return true
}
