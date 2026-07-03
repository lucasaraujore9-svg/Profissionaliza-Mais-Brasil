import { prisma } from "@/lib/prisma"
import { isLmsConfigured, revokeLmsEnrollment } from "@/lib/lms"
import { createNotification } from "@/lib/notifications"
import { contextLogger } from "@/lib/logger"

/**
 * LGPD-013: propaga a exclusão/anonimização do titular aos subprocessadores.
 *
 * O que É feito por API (o client já existe):
 *  - LMS: revoga cada matrícula do aluno (`revokeLmsEnrollment`), encerrando o
 *    acesso pago ao curso. O bloqueio do student no LMS/EA já é feito por
 *    `blockStudentInEA` no fluxo de erasure — aqui reforçamos a revogação
 *    por-matrícula (mais forte que o bloqueio).
 *
 * O que NÃO tem API de exclusão de PII (fica como pendência manual documentada):
 *  - EA / LMS não expõem endpoint para APAGAR nome/CPF/e-mail do aluno. Geramos
 *    uma pendência (notificação ao SUPER_ADMIN + retorno estruturado) para que a
 *    exclusão residual seja tratada conforme o DPA do subprocessador.
 *
 * O que NÃO se apaga por obrigação legal (conformidade, não omissão):
 *  - Asaas / Mercado Pago: dados fiscais/de pagamento têm base de retenção legal
 *    (art. 16, I da LGPD). Não são excluídos; a retenção é documentada no ROPA.
 *
 * Best-effort: NUNCA lança — a exclusão local do titular não pode ser bloqueada
 * por indisponibilidade de um subprocessador. Retorna o resultado por sistema
 * para o chamador registrar no audit trail.
 */
export interface ErasurePropagationResult {
  lmsEnrollmentsRevoked: number
  lmsEnrollmentsFailed: number
  hasEaAccount: boolean
  /** Subprocessadores sem API de exclusão de PII — requerem ação manual (DPA). */
  manualPending: string[]
  /** Subprocessadores com retenção por obrigação legal — não se apaga. */
  legalRetention: string[]
}

export async function propagateStudentErasure(
  studentId: string,
): Promise<ErasurePropagationResult> {
  const log = contextLogger()
  const result: ErasurePropagationResult = {
    lmsEnrollmentsRevoked: 0,
    lmsEnrollmentsFailed: 0,
    hasEaAccount: false,
    manualPending: [],
    legalRetention: [],
  }

  const student = await prisma.student
    .findUnique({
      where: { id: studentId },
      select: {
        plataformaAlunoId: true,
        nome: true,
        enrollments: {
          where: { lmsEnrollmentId: { not: null } },
          select: { lmsEnrollmentId: true },
        },
      },
    })
    .catch(() => null)

  if (!student) return result

  const hasEa = Boolean(student.plataformaAlunoId)
  result.hasEaAccount = hasEa

  // ── LMS: revoga cada matrícula (API disponível) ──
  if (isLmsConfigured() && student.enrollments.length > 0) {
    for (const e of student.enrollments) {
      if (!e.lmsEnrollmentId) continue
      try {
        await revokeLmsEnrollment(e.lmsEnrollmentId)
        result.lmsEnrollmentsRevoked += 1
      } catch (err) {
        result.lmsEnrollmentsFailed += 1
        log.error(
          { err, event: "lgpd.erasure.lms_revoke_failed", studentId, lmsEnrollmentId: e.lmsEnrollmentId },
          "revogação de matrícula LMS no erasure falhou",
        )
      }
    }
  }

  // ── Pendências manuais: EA/LMS não têm API para APAGAR a PII do aluno ──
  if (hasEa) result.manualPending.push("Plataforma EA — excluir/anonimizar PII do aluno (sem API; bloqueio já aplicado)")
  if (student.enrollments.length > 0) result.manualPending.push("LMS bmbr — excluir PII residual do aluno (sem API; matrículas revogadas)")

  // ── Retenção legal: pagamento/fiscal não se apaga ──
  result.legalRetention.push("Asaas/Mercado Pago — dados fiscais/de pagamento retidos por obrigação legal (art. 16, I LGPD)")

  // Notifica o SUPER_ADMIN com o checklist de ação manual, quando houver.
  if (result.manualPending.length > 0) {
    await createNotification({
      audience: "ROLE",
      roleTarget: "SUPER_ADMIN",
      level: "WARNING",
      title: "Exclusão de titular — ação manual em subprocessador",
      body:
        `Titular solicitou exclusão (student ${studentId}). Acesso revogado/bloqueado. ` +
        `Pendências de exclusão de PII residual (sem API): ${result.manualPending.join("; ")}.`,
      category: "lgpd",
      href: "/admin/configuracoes",
    }).catch((err) => {
      log.error(
        { err, event: "lgpd.erasure.notify_failed", studentId },
        "notificação de pendência manual de erasure falhou",
      )
    })
  }

  log.info(
    {
      event: "lgpd.erasure.propagated",
      studentId,
      lmsEnrollmentsRevoked: result.lmsEnrollmentsRevoked,
      lmsEnrollmentsFailed: result.lmsEnrollmentsFailed,
      hasEaAccount: result.hasEaAccount,
      manualPending: result.manualPending.length,
    },
    "propagação de erasure aos subprocessadores concluída",
  )

  return result
}
