import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { issueCertificateIfEligible } from "@/lib/certificates/issue"
import {
  syncSingleLmsCourse,
  deactivateLmsCourse,
} from "@/lib/catalog/sync-lms"
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
  // Edicao de um curso JA publicado (preco, categoria, matriz, conteudo). Sem
  // este evento, uma edicao sem (re)publicar so entraria no PMB no sync diario.
  // Sincroniza SO o curso do evento (incremental), nao o catalogo inteiro.
  "course.updated",
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
  // SAAS-008: distingue falha de negócio TERMINAL (retry não ajuda — ex.: aluno
  // inexistente no suporte) de falha TRANSITÓRIA/ainda-não-pronta (ex.:
  // `course.completed` chega antes do fulfillment do PMB criar a matrícula, numa
  // corrida). `retryable=true` faz a rota devolver 500 dentro da janela de
  // reentrega, para o LMS re-tentar e o certificado não se perder.
  retryable?: boolean
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

// course.published / course.updated: o payload traz `{ courseId, slug }` (contrato
// docs/api/lms-webhook-catalogo.md §9.4). Sincronizamos SO esse curso pelo detalhe
// `/courses/:slug` (sync incremental — PERF-010/API-007), em vez de re-puxar o
// catálogo inteiro por evento. `slug` é a chave do pull; `courseId` fica opcional.
const catalogUpsertSchema = z
  .object({ slug: z.string().min(1), courseId: z.string().optional() })
  .passthrough()

// course.unpublished: precisamos do `courseId` (= Course.lmsCourseId) para marcar
// o curso como INATIVO. O detalhe do LMS retornaria 404 (curso despublicado), então
// não dá para resolver por slug — usamos o id estável, espelhando o day-update.
const catalogUnpublishSchema = z
  .object({ courseId: z.string().min(1), slug: z.string().optional() })
  .passthrough()

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
      // SAAS-008: matrícula ausente pode ser corrida (conclusão antes do
      // fulfillment). Sinaliza retryable → a rota reentrega dentro da janela em
      // vez de descartar a conclusão (e o certificado) como terminal.
      if (!enr)
        return { ok: false, retryable: true, message: "matrícula LMS não encontrada" }

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
      // SAAS-008: mesma corrida do course.completed — retryable dentro da janela.
      if (!enr)
        return { ok: false, retryable: true, message: "matrícula LMS não encontrada" }

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
    case "course.updated": {
      // Sync incremental: só o curso do evento (pull do detalhe por slug).
      const p = catalogUpsertSchema.parse(payload)
      const res = await syncSingleLmsCourse(p.slug)
      if (res === null) {
        return {
          ok: true,
          message: `curso não publicado no LMS, nada a sincronizar (${eventType}: ${p.slug})`,
        }
      }
      return {
        ok: true,
        message: `curso sincronizado (${eventType}: ${p.slug}, ${res.created ? "novo" : "atualizado"})`,
      }
    }

    case "course.unpublished": {
      // Despublicação incremental: marca só o curso do evento como INATIVO.
      const p = catalogUnpublishSchema.parse(payload)
      const count = await deactivateLmsCourse(p.courseId)
      return {
        ok: true,
        message: `curso despublicado (${p.courseId}, ${count} linha(s) afetada(s))`,
      }
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
