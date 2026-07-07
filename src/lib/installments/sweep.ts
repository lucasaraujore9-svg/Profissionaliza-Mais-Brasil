/**
 * Varredura diária do carnê (cron `sweep-boleto-installments`):
 *   A. Emite os boletos MP cujo vencimento entrou na janela de 7 dias (o MP não
 *      tem carnê nativo — cada boleto é emitido perto do vencimento).
 *   B. Marca parcelas vencidas como OVERDUE e bloqueia o acesso do aluno na
 *      plataforma (mesmo primitivo do auto-block por inadimplência). A parcela
 *      paga depois reativa via settleBoletoInstallment.
 *
 * Idempotente: A pula parcelas já emitidas; B pula matrículas já suspensas.
 */
import { prisma } from "@/lib/prisma"
import { blockStudentInEA } from "@/lib/students/plataforma-actions"
import { createNotification } from "@/lib/notifications"
import { swallow } from "@/lib/errors"
import { contextLogger } from "@/lib/logger"
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
}

const GENERATE_BATCH = 200
const OVERDUE_BATCH = 500

export async function runBoletoInstallmentSweep(now: Date = new Date()): Promise<SweepResult> {
  const result: SweepResult = {
    generated: 0,
    generateErrors: 0,
    markedOverdue: 0,
    suspended: 0,
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

  return result
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
