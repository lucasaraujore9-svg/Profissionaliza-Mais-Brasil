import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { issueCertificateIfEligible } from "@/lib/certificates/issue"
import { syncCatalogFromLMS } from "@/lib/catalog/sync-lms"
import {
  createStudentSupportTicket,
  SUPPORT_STUDENT_SELECT,
} from "@/lib/support/student-support"
import { contextLogger } from "@/lib/logger"

/**
 * Processamento dos webhooks de ENTRADA do LMS. Cada handler é IDEMPOTENTE
 * (atualizações são overwrite; certificado tem dedup interna por matrícula) para
 * tolerar re-entregas. O match aluno↔matrícula espelha o day-update:
 * studentExternalId = Student.id; courseId = Course.lmsCourseId.
 */

export const LMS_WEBHOOK_EVENTS = [
  "course.completed",
  "course.published",
  "course.unpublished",
  "lesson.completed",
  "student.question.created",
] as const

export type LmsWebhookEvent = (typeof LMS_WEBHOOK_EVENTS)[number]

export function isLmsWebhookEvent(t: string | null): t is LmsWebhookEvent {
  return t != null && (LMS_WEBHOOK_EVENTS as readonly string[]).includes(t)
}

export interface LmsWebhookResult {
  ok: boolean
  message: string
}

// ── Schemas por evento ──────────────────────────────────────────────────────

const courseCompletedSchema = z.object({
  studentExternalId: z.string().min(1),
  courseId: z.string().min(1), // = Course.lmsCourseId
  completedAt: z.string().optional(),
})

const lessonCompletedSchema = z.object({
  studentExternalId: z.string().min(1),
  courseId: z.string().min(1),
  percent: z.number().optional(),
  completedAt: z.string().optional(),
  lastActivityAt: z.string().optional(),
})

// course.published / course.unpublished: o sync de catálogo é completo (busca
// capa/detalhe), então não exigimos campos — aceitamos o payload como veio.
const catalogSchema = z.object({}).passthrough()

const supportSchema = z.object({
  studentExternalId: z.string().min(1),
  title: z.string().trim().max(120).optional(),
  body: z.string().trim().min(1).max(4000),
  context: z.string().trim().max(200).optional(),
})

// ── Helpers ─────────────────────────────────────────────────────────────────

function clampPercent(p: number): number {
  if (!Number.isFinite(p)) return 0
  return Math.max(0, Math.min(100, Math.round(p)))
}

/** Matrícula LMS do aluno para um curso (mesma seleção do day-update). */
async function findLmsEnrollment(
  studentExternalId: string,
  lmsCourseId: string,
): Promise<{ id: string } | null> {
  return prisma.enrollment.findFirst({
    where: {
      studentId: studentExternalId,
      course: { lmsCourseId },
      status: { in: ["ACTIVE", "COMPLETED", "SUSPENDED"] },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  })
}

/** Lê o flag de emissão automática de certificado (default true se ausente). */
async function certificateAutoIssueEnabled(): Promise<boolean> {
  const s = await prisma.systemSettings.findUnique({
    where: { id: "default" },
    select: { certificateAutoIssue: true },
  })
  return s?.certificateAutoIssue ?? true
}

// ── Dispatcher ──────────────────────────────────────────────────────────────

export async function processLmsWebhookEvent(
  eventType: LmsWebhookEvent,
  payload: unknown,
): Promise<LmsWebhookResult> {
  switch (eventType) {
    case "course.completed": {
      const p = courseCompletedSchema.parse(payload)
      const enr = await findLmsEnrollment(p.studentExternalId, p.courseId)
      if (!enr) return { ok: false, message: "matrícula LMS não encontrada" }

      // Reflete a conclusão no progresso ANTES de emitir (igual ao day-update),
      // para a emissão passar no critério de % mínimo.
      await prisma.enrollment.update({
        where: { id: enr.id },
        data: {
          progressPercent: 100,
          progressStatus: "CONCLUIDO",
          lastLessonAt: p.completedAt ? new Date(p.completedAt) : new Date(),
          progressSyncedAt: new Date(),
        },
      })

      if (await certificateAutoIssueEnabled()) {
        await issueCertificateIfEligible(enr.id, "AUTO")
      }
      return { ok: true, message: `conclusão processada (matrícula ${enr.id})` }
    }

    case "lesson.completed": {
      const p = lessonCompletedSchema.parse(payload)
      const enr = await findLmsEnrollment(p.studentExternalId, p.courseId)
      if (!enr) return { ok: false, message: "matrícula LMS não encontrada" }

      const completed = Boolean(p.completedAt)
      await prisma.enrollment.update({
        where: { id: enr.id },
        data: {
          ...(p.percent != null ? { progressPercent: clampPercent(p.percent) } : {}),
          progressStatus: completed ? "CONCLUIDO" : "EM_ANDAMENTO",
          lastLessonAt: p.lastActivityAt
            ? new Date(p.lastActivityAt)
            : p.completedAt
              ? new Date(p.completedAt)
              : new Date(),
          progressSyncedAt: new Date(),
        },
      })
      return { ok: true, message: `progresso atualizado (matrícula ${enr.id})` }
    }

    case "course.published":
    case "course.unpublished": {
      catalogSchema.parse(payload)
      await syncCatalogFromLMS("cron")
      return { ok: true, message: `catálogo sincronizado (${eventType})` }
    }

    case "student.question.created": {
      const p = supportSchema.parse(payload)
      const student = await prisma.student.findUnique({
        where: { id: p.studentExternalId },
        select: SUPPORT_STUDENT_SELECT,
      })
      if (!student) return { ok: false, message: "aluno não encontrado" }

      const assunto =
        p.title?.trim() ||
        (p.context ? `Dúvida — ${p.context}` : "Dúvida no curso (LMS)")
      await createStudentSupportTicket({
        student,
        assunto,
        mensagem: p.body,
        source: "lms",
      })
      contextLogger().info(
        { event: "lms.webhook.support_routed", studentId: student.id, tenantId: student.tenantId },
        "suporte do LMS roteado para a caixa de atendimento",
      )
      return { ok: true, message: `suporte roteado (aluno ${student.id})` }
    }
  }
}
