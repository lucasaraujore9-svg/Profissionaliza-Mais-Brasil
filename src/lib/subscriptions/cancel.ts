import { prisma } from "@/lib/prisma"
import { unlinkCourseFromStudent } from "@/lib/students/plataforma-actions"
import {
  cancelSubscription as cancelAsaasSubscription,
  motherAsaasKey,
} from "@/lib/asaas/client"
import { cancelPreapproval } from "@/lib/mercadopago/client"
import { resolveEnrollmentGatewayKeys } from "@/lib/enrollment/gateway-credentials"
import { runInChunks } from "@/lib/concurrency"
import { contextLogger } from "@/lib/logger"
import { createNotification } from "@/lib/notifications"
import { swallow } from "@/lib/errors"

/**
 * Encerra uma assinatura e corta o acesso que ela dava.
 *
 * O QUE ESTA FUNCAO NAO FAZ, DE PROPOSITO:
 *
 * 1. **Nao chama `blockStudentInEA`.** Aquilo bloqueia o LOGIN da pessoa por
 *    CPF, e o mesmo login carrega os cursos que ela COMPROU avulso. Cancelar a
 *    assinatura derrubaria o curso pago separadamente — bem pior que o vazamento
 *    que se quer evitar.
 * 2. **Nao toca em `Certificate`.** Documento emitido ja circulou; revoga-lo
 *    faria `/validar/{code}` responder "nao encontrado" para quem conferisse o
 *    codigo — le como fraude. Concluiu enquanto pagava, o diploma e dele.
 * 3. **Nao mexe em matricula de compra avulsa.** So alcanca linhas com
 *    `studentSubscriptionId` desta assinatura.
 *
 * O QUE ELA FAZ E CUSTA CARO: na EA, desvincular um curso APAGA o progresso do
 * aluno naquele curso (desvincular e revincular zera — confirmado em 2026-07-22,
 * ver `plataforma-actions.ts`). Por isso o corte roda SO no cancelamento
 * definitivo, nunca num atraso dentro da carencia: quem se atrasou e pagou nao
 * pode perder o que assistiu. No LMS a revogacao e por matricula e nao tem esse
 * efeito.
 */

interface GatewayRefs {
  gateway: string
  tenantId: string | null
  asaasSubscriptionId: string | null
  mpPreapprovalId: string | null
}

/**
 * Encerra a recorrencia na origem. Idempotente na pratica: cancelar uma
 * assinatura ja cancelada no gateway responde erro conhecido, e o caller so
 * alerta — nunca reabre o cancelamento local.
 */
async function stopGatewayRecurrence(
  sub: GatewayRefs,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (sub.asaasSubscriptionId) {
      // Vitrine PMB assina pela conta-mãe; unidade, pela conta dela.
      await cancelAsaasSubscription(sub.asaasSubscriptionId, motherAsaasKey())
      return { ok: true }
    }
    if (sub.mpPreapprovalId) {
      // Reusa o resolvedor de credenciais das matrículas: ele já sabe escolher
      // entre a conta-mãe e a da unidade e já decifra o token.
      const keys = await resolveEnrollmentGatewayKeys({ tenantId: sub.tenantId })
      if (!keys.mpAccessToken) {
        return { ok: false, error: keys.missing ?? "token do Mercado Pago indisponível" }
      }
      await cancelPreapproval(keys.mpAccessToken, sub.mpPreapprovalId)
      return { ok: true }
    }
    // Assinatura que nunca chegou ao gateway (checkout abortado): nada a parar.
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export interface CancelSubscriptionResult {
  enrollmentsCancelled: number
  revoked: number
  errors: string[]
}

/**
 * @param reason Aparece na notificacao ao aluno e no log.
 * @param revokeAccess `false` cancela a cobranca mas MANTEM o acesso ate o fim
 *   do ciclo ja pago (pedido de cancelamento com `cancelAtPeriodEnd`).
 */
export async function cancelSubscriptionAccess(
  subscriptionId: string,
  reason: "REQUESTED" | "PAST_DUE" | "REFUNDED",
  revokeAccess = true,
): Promise<CancelSubscriptionResult> {
  const log = contextLogger()
  const result: CancelSubscriptionResult = {
    enrollmentsCancelled: 0,
    revoked: 0,
    errors: [],
  }

  const sub = await prisma.studentSubscription.findUnique({
    where: { id: subscriptionId },
    select: {
      id: true,
      studentId: true,
      tenantId: true,
      status: true,
      gateway: true,
      asaasSubscriptionId: true,
      mpPreapprovalId: true,
      plan: { select: { name: true } },
    },
  })
  if (!sub) return result

  // ── Encerrar a RECORRÊNCIA no gateway, ANTES de tudo ──────────────────────
  // Sem isto o Asaas/MP seguia emitindo (ou debitando no cartão) todo mês para
  // sempre, enquanto o aluno ficava sem acesso nenhum. É a parte do
  // cancelamento que custa dinheiro ao aluno; o resto só mexe em acesso.
  //
  // Falha aqui NÃO aborta o cancelamento — o acesso ainda precisa cair —, mas
  // alerta, porque uma recorrência órfã cobra alguém indefinidamente.
  const stopped = await stopGatewayRecurrence(sub)
  if (!stopped.ok) {
    result.errors.push(`gateway: ${stopped.error}`)
    await createNotification({
      audience: "ROLE",
      roleTarget: "SUPER_ADMIN",
      level: "WARNING",
      title: "Recorrência não cancelada no gateway",
      body: `Assinatura ${subscriptionId} (${sub.plan.name}) foi encerrada no sistema, mas a cobrança recorrente NÃO pôde ser cancelada no gateway (${stopped.error}). Cancele à mão para não seguir cobrando o aluno.`,
      href: "/admin/alunos",
    }).catch(swallow("subscription.cancel"))
  }

  await prisma.studentSubscription.update({
    where: { id: subscriptionId },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelAtPeriodEnd: false },
  })

  if (!revokeAccess) return result

  // Inclui COMPLETED: emitir certificado promove a matrícula a COMPLETED
  // (`certificates/issue.ts`) e o SSO aceita ACTIVE **e** COMPLETED — deixá-la
  // de fora manteria o acesso justamente de quem mais usou a assinatura.
  const enrollments = await prisma.enrollment.findMany({
    where: {
      studentSubscriptionId: subscriptionId,
      status: { in: ["ACTIVE", "COMPLETED", "PENDING", "SUSPENDED"] },
    },
    select: { id: true, courseId: true },
  })

  // Serial em lotes pequenos: cada item fala com a fornecedora. `runInChunks` é
  // o padrão do repo para isso (nunca `$transaction([...])`, que derruba o lote
  // inteiro sobre o pooler).
  const settled = await runInChunks(enrollments, 4, async (e) => {
    await unlinkCourseFromStudent(sub.studentId, e.courseId)
    return e.id
  })

  const revokedIds: string[] = []
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") {
      revokedIds.push(enrollments[i].id)
    } else {
      const msg = s.reason instanceof Error ? s.reason.message : String(s.reason)
      result.errors.push(`enrollment ${enrollments[i].id}: ${msg}`)
    }
  })
  result.revoked = revokedIds.length

  // Cancela SÓ as que a fornecedora confirmou revogar. Marcar como cancelada uma
  // matrícula cujo acesso continua de pé esconderia o vazamento: a tela diria
  // "sem acesso" e o aluno seguiria assistindo.
  if (revokedIds.length > 0) {
    const updated = await prisma.enrollment.updateMany({
      where: { id: { in: revokedIds } },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    })
    result.enrollmentsCancelled = updated.count
  }

  if (result.errors.length > 0) {
    log.error(
      {
        event: "subscription.cancel.revoke_errors",
        subscriptionId,
        errors: result.errors,
      },
      "falha ao revogar cursos de assinatura cancelada",
    )
    await createNotification({
      audience: "ROLE",
      roleTarget: "SUPER_ADMIN",
      level: "WARNING",
      title: "Acesso não revogado ao cancelar assinatura",
      body: `Assinatura ${subscriptionId} (${sub.plan.name}) cancelada, mas ${result.errors.length} curso(s) não puderam ser revogados na plataforma de aulas. O aluno pode seguir com acesso — verifique.`,
      href: "/admin/alunos",
    }).catch(swallow("subscription.cancel"))
  }

  log.info(
    {
      event: "subscription.cancelled",
      subscriptionId,
      reason,
      revoked: result.revoked,
      cancelled: result.enrollmentsCancelled,
    },
    "assinatura cancelada",
  )

  return result
}
