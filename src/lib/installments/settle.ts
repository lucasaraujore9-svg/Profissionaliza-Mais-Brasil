/**
 * Liquidação de UMA parcela paga do carnê. Chamado pelos webhooks (MP e Asaas)
 * depois de identificarem a `BoletoInstallment` pelo id do pagamento no gateway.
 *
 * Reusa `fulfillEnrollment` (mesmo fluxo da mensalidade): como a matrícula tem
 * `installmentsTotal = N`, a 1ª parcela paga provisiona o acesso (entrada) e as
 * demais só registram o Payment + incrementam a contagem. Aqui, além disso,
 * marcamos a linha da parcela como PAID e reativamos o acesso se a matrícula
 * estava suspensa por inadimplência e não há mais parcela vencida em aberto.
 */
import type { BoletoInstallment } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { fulfillEnrollment, type TenantContext } from "@/lib/enrollment/fulfill"
import {
  evaluatePaceGate,
  evaluateSatellitePaceGates,
} from "@/lib/enrollment/pace"
import { unblockStudentInEA } from "@/lib/students/plataforma-actions"
import { createNotification } from "@/lib/notifications"
import { swallow } from "@/lib/errors"
import { contextLogger } from "@/lib/logger"
import { isOverdue } from "./schedule"

export interface InstallmentPaymentEvent {
  gateway: "MP" | "ASAAS"
  /** id do pagamento DESTA parcela no gateway (mpPaymentId ou asaasPaymentId). */
  externalPaymentId: string
  amount: number
  paidAt: Date
  mpPaymentType?: string
}

export async function settleBoletoInstallment(params: {
  installment: BoletoInstallment
  tenant: TenantContext
  event: InstallmentPaymentEvent
}): Promise<void> {
  const { installment, tenant, event } = params

  // Lê o status ANTES do fulfill: se esta for a ÚLTIMA parcela de uma matrícula
  // SUSPENDED, o fulfill a marca COMPLETED — sem este snapshot, maybeReactivate
  // veria COMPLETED, retornaria cedo e o aluno ficaria bloqueado na plataforma
  // para sempre mesmo com o carnê 100% quitado.
  const before = await prisma.enrollment.findUnique({
    where: { id: installment.enrollmentId },
    select: { status: true },
  })
  const wasSuspended = before?.status === "SUSPENDED"

  // Provisiona (1ª) / registra (demais). Idempotente por payment id + advisory
  // lock — re-entregas do webhook viram no-op.
  await fulfillEnrollment(tenant, installment.enrollmentId, {
    gateway: event.gateway,
    externalPaymentId: event.externalPaymentId,
    amount: event.amount,
    paidAt: event.paidAt,
    paymentType: "BOLETO_INSTALLMENT",
    mpPaymentType: event.mpPaymentType,
  })

  // Marca a parcela como paga (idempotente).
  await prisma.boletoInstallment
    .update({
      where: { id: installment.id },
      data: { status: "PAID", paidAt: event.paidAt },
    })
    .catch(swallow("installments.settle.mark_paid"))

  await maybeReactivate(installment.enrollmentId, wasSuspended)

  // Cota de aulas: a parcela paga aumentou a fatia liberada. Reavalia DEPOIS do
  // maybeReactivate — que pode ter acabado de devolver o acesso por
  // inadimplência resolvida — para que a trava de ritmo seja reaplicada caso o
  // aluno já tenha passado da nova cota. Sem esta ordem, quitar uma parcela
  // atrasada destravaria o curso inteiro de quem está adiantado no conteúdo.
  await evaluatePaceGate(installment.enrollmentId)
  // Os demais cursos da mesma compra (satélites) seguem o mesmo carnê: a fatia
  // deles também subiu. Depois do `maybeReactivate` pelo mesmo motivo acima.
  await evaluateSatellitePaceGates(installment.enrollmentId)
}

/**
 * Se a matrícula estava SUSPENDED (bloqueada por inadimplência) e não há mais
 * parcela vencida em aberto, restaura o acesso do aluno na plataforma e reativa.
 * `wasSuspended` cobre a última parcela: o fulfill já virou COMPLETED, mas o
 * aluno ainda está bloqueado na plataforma — desbloqueia mantendo COMPLETED.
 */
async function maybeReactivate(
  enrollmentId: string,
  wasSuspended = false,
): Promise<void> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: { id: true, status: true, studentId: true },
  })
  if (!enrollment) return
  const completedWhileSuspended =
    wasSuspended && enrollment.status === "COMPLETED"
  if (enrollment.status !== "SUSPENDED" && !completedWhileSuspended) return

  const open = await prisma.boletoInstallment.findMany({
    where: {
      enrollmentId,
      status: { in: ["SCHEDULED", "GENERATED", "OVERDUE"] },
    },
    select: { dueDate: true, status: true },
  })
  const stillOverdue = open.some((o) => isOverdue(o))
  if (stillOverdue) return

  try {
    await unblockStudentInEA(enrollment.studentId)
  } catch (err) {
    contextLogger().error(
      { err, event: "installments.reactivate.unblock_failed", enrollmentId },
      "desbloqueio do aluno na plataforma falhou — mantém suspenso",
    )
    return // não reativa se o desbloqueio na plataforma falhou
  }

  // Quitou tudo enquanto suspensa: mantém COMPLETED (só o desbloqueio acima
  // importava). Caso normal: volta a ACTIVE.
  if (!completedWhileSuspended) {
    await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { status: "ACTIVE" },
    })
  }

  await createNotification({
    audience: "STUDENT",
    studentId: enrollment.studentId,
    level: "SUCCESS",
    title: "Acesso reativado",
    body: "Recebemos o pagamento e seu acesso ao curso foi reativado.",
    category: "enrollment",
    href: "/aluno/cursos",
  }).catch(swallow("installments.reactivate.notify"))
}
