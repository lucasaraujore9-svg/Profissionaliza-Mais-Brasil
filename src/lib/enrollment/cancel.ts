import { prisma } from "@/lib/prisma"
import {
  cancelSubscription as cancelAsaasSubscription,
  deletePayment as deleteAsaasPayment,
  deleteInstallment as deleteAsaasInstallment,
  AsaasApiError,
} from "@/lib/asaas/client"
import {
  cancelPreapproval,
  cancelPayment as cancelMpPayment,
  MPApiError,
} from "@/lib/mercadopago/client"
import { unlinkCourseFromStudent } from "@/lib/students/plataforma-actions"
import {
  resolveEnrollmentGatewayKeys,
  type EnrollmentGatewayKeys,
} from "@/lib/enrollment/gateway-credentials"
import { clearPaceFlags, releaseStudentPaceIfClear } from "@/lib/enrollment/pace"
import { contextLogger } from "@/lib/logger"
import { logAudit } from "@/lib/audit"
import type { EnrollmentStatus, PaymentGateway } from "@prisma/client"

/**
 * Cancelamento de matrícula — o inverso de `fulfillEnrollment`.
 *
 * Motor ÚNICO usado pelos três pontos de entrada (vitrine PMB em
 * /admin/vendas/alunos, admin master em /admin/alunos e revenda em
 * /painel/alunos), para que "cancelar" signifique exatamente a mesma coisa nos
 * três: encerrar a cobrança no gateway CERTO, cancelar as parcelas do carnê
 * ainda não pagas, opcionalmente remover o acesso às aulas e marcar a matrícula
 * (e as satélites de pacote) como CANCELLED.
 *
 * NÃO estorna dinheiro já recebido — devolução é decisão manual, fora daqui.
 * Certificado já emitido também é preservado.
 */

/** Matrícula cancelável: pagamento pendente ou curso ainda não concluído. */
const CANCELLABLE_STATUSES: EnrollmentStatus[] = ["PENDING", "ACTIVE", "SUSPENDED"]

export function isCancellableEnrollmentStatus(status: EnrollmentStatus): boolean {
  return CANCELLABLE_STATUSES.includes(status)
}

export interface CancelEnrollmentParams {
  enrollmentId: string
  /**
   * Escopo de isolamento. `undefined` = sem restrição (admin já autorizado pela
   * rota); `null` = só vitrine PMB; string = só aquela unidade. Aplicado no
   * `where` da busca, então matrícula de outra unidade vira NOT_FOUND.
   */
  expectedTenantId?: string | null
  /** Também desvincula o curso na plataforma de aulas (EA ou LMS). */
  removeAccess: boolean
  actor: { userId: string; role: string; email?: string | null }
  reason?: string
}

export type CancelEnrollmentOutcome =
  | { ok: false; code: "NOT_FOUND" | "ALREADY_CANCELLED" | "COMPLETED" }
  | {
      ok: true
      /** Matrícula cancelada + satélites de pacote arrastadas junto. */
      cancelledIds: string[]
      /** Falha ao encerrar a cobrança no gateway (não impede o cancelamento local). */
      gatewayError?: string
      /** Falha ao remover o acesso na plataforma de aulas. */
      platformError?: string
    }

export async function cancelEnrollment(
  params: CancelEnrollmentParams,
): Promise<CancelEnrollmentOutcome> {
  const { enrollmentId, expectedTenantId, removeAccess, actor, reason } = params

  const enrollment = await prisma.enrollment.findFirst({
    where: {
      id: enrollmentId,
      ...(expectedTenantId === undefined ? {} : { tenantId: expectedTenantId }),
    },
    select: {
      id: true,
      tenantId: true,
      studentId: true,
      courseId: true,
      status: true,
      gateway: true,
      coursePackageId: true,
      packagePrimary: true,
      asaasPaymentId: true,
      asaasSubscriptionId: true,
      asaasInstallmentId: true,
      mpPaymentId: true,
      mpSubscriptionId: true,
    },
  })

  if (!enrollment) return { ok: false, code: "NOT_FOUND" }
  if (enrollment.status === "CANCELLED") return { ok: false, code: "ALREADY_CANCELLED" }
  if (enrollment.status === "COMPLETED") return { ok: false, code: "COMPLETED" }

  // Credenciais do gateway resolvidas a partir do tenantId DA MATRÍCULA — nunca
  // do contexto de quem está logado. Ver gateway-credentials.ts.
  const keys = await resolveEnrollmentGatewayKeys(enrollment)
  const gatewayErrors: string[] = []

  await cancelAtGateway(enrollment, keys, gatewayErrors)

  // Satélites de pacote: a matrícula PRIMÁRIA carrega o pagamento do pacote
  // inteiro, então cancelá-la tem que arrastar os cursos que vieram junto
  // (finalAmount 0, sem cobrança própria). Cancelar um satélite isolado NÃO
  // toca na primária — o aluno perde só aquele curso.
  const satellites =
    enrollment.packagePrimary && enrollment.coursePackageId
      ? await prisma.enrollment.findMany({
          where: {
            studentId: enrollment.studentId,
            tenantId: enrollment.tenantId,
            coursePackageId: enrollment.coursePackageId,
            packagePrimary: false,
            status: { in: CANCELLABLE_STATUSES },
          },
          select: { id: true, courseId: true },
        })
      : []

  const cancelledIds = [enrollment.id, ...satellites.map((s) => s.id)]

  // Remoção do acesso às aulas (EA ou LMS — `unlinkCourseFromStudent` ramifica).
  let platformError: string | undefined
  if (removeAccess) {
    const platformErrors: string[] = []
    for (const target of [
      { id: enrollment.id, courseId: enrollment.courseId },
      ...satellites,
    ]) {
      try {
        await unlinkCourseFromStudent(enrollment.studentId, target.courseId)
      } catch (err) {
        platformErrors.push(
          err instanceof Error ? err.message : "falha ao remover acesso",
        )
        contextLogger().error(
          {
            err,
            event: "enrollment.cancel.unlink_failed",
            enrollmentId: target.id,
            studentId: enrollment.studentId,
            courseId: target.courseId,
          },
          "falha ao desvincular curso na plataforma de aulas",
        )
      }
    }
    if (platformErrors.length > 0) platformError = platformErrors.join("; ")
  }

  await cancelPendingBoletoInstallments(cancelledIds, keys, gatewayErrors)

  // Updates SEQUENCIAIS: `prisma.$transaction([...])` em lote derruba a operação
  // sobre o pooler do Supabase (adapter-pg). Ver fix 019a253.
  const cancelledAt = new Date()
  for (const id of cancelledIds) {
    await prisma.enrollment.update({
      where: { id },
      data: { status: "CANCELLED", cancelledAt },
    })
  }

  // Cota de aulas: a matrícula cancelada sai da equação. Limpa o flag dela (para
  // a UI não mostrar "travado por parcelamento" num curso cancelado) e libera o
  // acesso do aluno na plataforma se nenhuma outra matrícula viva ainda merecer
  // a trava. Sem isto, cancelar justamente a matrícula que travou o aluno o
  // deixaria em `DEVEDOR` para sempre — nada mais o reavaliaria.
  await clearPaceFlags(cancelledIds)
  await releaseStudentPaceIfClear(enrollment.studentId)

  const gatewayError = gatewayErrors.length > 0 ? gatewayErrors.join("; ") : undefined

  await logAudit({
    action: "enrollment.cancel",
    resource: "Enrollment",
    resourceId: enrollment.id,
    actorUserId: actor.userId,
    actorRole: actor.role,
    actorEmail: actor.email ?? null,
    tenantId: enrollment.tenantId,
    payloadBefore: { status: enrollment.status, gateway: enrollment.gateway },
    payloadAfter: {
      status: "CANCELLED",
      studentId: enrollment.studentId,
      removeAccess,
      cancelledIds,
      satellites: satellites.length,
      hadGatewayError: Boolean(gatewayError),
      hadPlatformError: Boolean(platformError),
      reason: reason ?? null,
    },
  })

  return {
    ok: true,
    cancelledIds,
    ...(gatewayError ? { gatewayError } : {}),
    ...(platformError ? { platformError } : {}),
  }
}

interface GatewayTarget {
  id: string
  tenantId: string | null
  status: EnrollmentStatus
  gateway: PaymentGateway
  asaasPaymentId: string | null
  asaasSubscriptionId: string | null
  asaasInstallmentId: string | null
  mpPaymentId: string | null
  mpSubscriptionId: string | null
}

/**
 * Encerra a cobrança no gateway que emitiu a venda. Soft-fail: qualquer erro
 * aqui é reportado, mas NÃO impede o cancelamento local — deixar a matrícula
 * ativa porque o gateway respondeu 500 seria pior (o operador ficaria sem
 * nenhuma forma de concluir a operação). 404 é sucesso: a cobrança já não existe.
 */
async function cancelAtGateway(
  enrollment: GatewayTarget,
  keys: EnrollmentGatewayKeys,
  errors: string[],
): Promise<void> {
  try {
    if (enrollment.gateway === "ASAAS") {
      if (!keys.asaasApiKey) {
        errors.push(keys.missing ?? "conta Asaas da venda não disponível")
        return
      }
      if (enrollment.asaasSubscriptionId) {
        await tolerate404(() =>
          cancelAsaasSubscription(enrollment.asaasSubscriptionId!, keys.asaasApiKey),
        )
      } else if (enrollment.asaasInstallmentId) {
        // DELETE /installments/{id} remove o carnê e TODAS as parcelas não pagas.
        await tolerate404(() =>
          deleteAsaasInstallment(enrollment.asaasInstallmentId!, keys.asaasApiKey!),
        )
      } else if (enrollment.asaasPaymentId && enrollment.status === "PENDING") {
        await tolerate404(() =>
          deleteAsaasPayment(enrollment.asaasPaymentId!, keys.asaasApiKey),
        )
      }
      return
    }

    if (!keys.mpAccessToken) {
      errors.push(keys.missing ?? "conta Mercado Pago da venda não disponível")
      return
    }
    if (enrollment.mpSubscriptionId) {
      await tolerate404(() =>
        cancelPreapproval(keys.mpAccessToken!, enrollment.mpSubscriptionId!),
      )
    } else if (enrollment.mpPaymentId && enrollment.status === "PENDING") {
      // PIX/boleto ainda não pago: cancela para o aluno não conseguir pagar uma
      // matrícula que acabou de ser encerrada.
      await tolerate404(() =>
        cancelMpPayment(keys.mpAccessToken!, enrollment.mpPaymentId!),
      )
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "falha ao cancelar no gateway")
    contextLogger().error(
      {
        err,
        event: "enrollment.cancel.gateway_failed",
        enrollmentId: enrollment.id,
        tenantId: enrollment.tenantId,
        gateway: enrollment.gateway,
      },
      "falha ao cancelar cobrança no gateway",
    )
  }
}

/**
 * Parcelas do carnê (venda parcelada no boleto) ainda não pagas. As `PAID` são
 * preservadas — são histórico financeiro. No MP cada parcela é um boleto avulso
 * e precisa ser cancelada uma a uma; no Asaas o `deleteInstallment` acima já
 * derrubou as cobranças, e a chamada por parcela apenas confirma (404 = ok).
 */
async function cancelPendingBoletoInstallments(
  enrollmentIds: string[],
  keys: EnrollmentGatewayKeys,
  errors: string[],
): Promise<void> {
  const pending = await prisma.boletoInstallment.findMany({
    where: {
      enrollmentId: { in: enrollmentIds },
      status: { in: ["SCHEDULED", "GENERATED", "OVERDUE"] },
    },
    select: { id: true, gateway: true, mpPaymentId: true, asaasPaymentId: true },
  })

  for (const parcela of pending) {
    try {
      if (parcela.gateway === "MP" && parcela.mpPaymentId && keys.mpAccessToken) {
        await tolerate404(() =>
          cancelMpPayment(keys.mpAccessToken!, parcela.mpPaymentId!),
        )
      } else if (
        parcela.gateway === "ASAAS" &&
        parcela.asaasPaymentId &&
        keys.asaasApiKey
      ) {
        await tolerate404(() =>
          deleteAsaasPayment(parcela.asaasPaymentId!, keys.asaasApiKey),
        )
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "falha ao cancelar parcela")
      contextLogger().error(
        {
          err,
          event: "enrollment.cancel.installment_failed",
          boletoInstallmentId: parcela.id,
        },
        "falha ao cancelar parcela do carnê no gateway",
      )
    }

    // O status local vira CANCELLED mesmo se o gateway falhou — a parcela não
    // pertence mais a uma matrícula viva, e o cron de emissão (sweep) já ignora
    // parcelas de matrícula CANCELLED.
    await prisma.boletoInstallment.update({
      where: { id: parcela.id },
      data: { status: "CANCELLED" },
    })
  }
}

/** 404 = a cobrança já não existe no gateway; isso é sucesso, não erro. */
async function tolerate404<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn()
  } catch (err) {
    const status =
      err instanceof AsaasApiError || err instanceof MPApiError
        ? err.statusCode
        : null
    if (status === 404) return null
    throw err
  }
}
