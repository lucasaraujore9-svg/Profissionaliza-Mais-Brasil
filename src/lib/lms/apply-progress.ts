import { prisma } from "@/lib/prisma"
import {
  issueCertificateIfEligible,
  NotCertifiableError,
  PaceGateError,
} from "@/lib/certificates/issue"
import { evaluatePaceGate } from "@/lib/enrollment/pace"
import { contextLogger } from "@/lib/logger"

/**
 * Fatia do curso do aluno no LMS que importa para o PROGRESSO. Deliberadamente
 * estrutural e mais estreita que `LmsDayStudentCourse`/`LmsStudentCourse`: os
 * dois endpoints do LMS (delta `day-update` e perfil `GET /students/:ref`)
 * descrevem o mesmo estado com tipos ligeiramente diferentes (`percent` é
 * obrigatório num e opcional no outro). Um tipo estreito deixa os dois caberem
 * sem `as`.
 */
export interface LmsCourseProgress {
  courseId: string
  percent?: number
  status: string // "in_progress" | "completed" | ...
  lastActivityAt?: string | null
}

function clampPercent(p: number): number {
  if (!Number.isFinite(p)) return 0
  return Math.max(0, Math.min(100, Math.round(p)))
}

/**
 * Aplica numa matrícula o progresso reportado pelo LMS: grava percentual/status,
 * reavalia a cota de aulas e emite o certificado na conclusão.
 *
 * Vive num módulo próprio porque tem DOIS chamadores — o delta horário
 * (`syncLmsDayUpdate`) e a atualização sob demanda de um aluno
 * (`syncLmsStudentProgress`). Duplicar o mapeamento faria as duas metades
 * divergirem em silêncio: bastaria uma delas esquecer `evaluatePaceGate` para o
 * aluno de compra parcelada ficar com o curso inteiro liberado no LMS.
 */
export async function applyLmsCourseProgress(
  enrollmentId: string,
  course: LmsCourseProgress,
  opts: { autoIssue: boolean; event: string },
): Promise<{ certificateIssued: boolean }> {
  const completed = course.status === "completed"

  await prisma.enrollment.update({
    where: { id: enrollmentId },
    data: {
      progressPercent: clampPercent(course.percent ?? 0),
      progressStatus: completed
        ? "CONCLUIDO"
        : course.status === "in_progress"
          ? "EM_ANDAMENTO"
          : "AGUARDANDO",
      ...(course.lastActivityAt
        ? { lastLessonAt: new Date(course.lastActivityAt) }
        : {}),
      progressSyncedAt: new Date(),
    },
  })

  // Cota de aulas: reavalia com o progresso recém-sincronizado.
  await evaluatePaceGate(enrollmentId)

  if (!completed || !opts.autoIssue) return { certificateIssued: false }

  try {
    await issueCertificateIfEligible(enrollmentId, "AUTO")
    return { certificateIssued: true }
  } catch (err) {
    // Cota de aulas: recusa ESPERADA enquanto faltar parcela — o certificado
    // sai sozinho na quitação. Logar como erro encheria o log de ruído.
    // E-book concluído (o aluno marcou "li") chega aqui pelo mesmo evento de
    // conclusão do curso — de propósito: o LMS reporta o FATO, e quem decide o
    // que não se faz com ele é o PMB, que é quem certifica. A recusa é esperada,
    // então não é erro.
    if (err instanceof NotCertifiableError) {
      contextLogger().info(
        { event: `${opts.event}.certificate_not_applicable`, enrollmentId },
        "conclusão registrada — conteúdo não emite certificado",
      )
    } else if (err instanceof PaceGateError) {
      contextLogger().info(
        { event: `${opts.event}.certificate_pace_blocked`, enrollmentId },
        "certificado adiado — parcelamento em aberto",
      )
    } else {
      contextLogger().error(
        { err, event: `${opts.event}.certificate_failed`, enrollmentId },
        "emissão de certificado (conclusão LMS) falhou",
      )
    }
    return { certificateIssued: false }
  }
}
