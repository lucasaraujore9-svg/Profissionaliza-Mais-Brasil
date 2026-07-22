import { prisma } from "@/lib/prisma"
import { lmsDayUpdate } from "./client"
import type { LmsDayStudent } from "./types"
import { issueCertificateIfEligible, PaceGateError } from "@/lib/certificates/issue"
import { evaluatePaceGate } from "@/lib/enrollment/pace"
import { contextLogger } from "@/lib/logger"

const SETTINGS_ID = "default"

export interface LmsDayUpdateResult {
  coursesUpdated: number
  progressUpdated: number
  certificatesIssued: number
  generatedAt: string
}

function clampPercent(p: number): number {
  if (!Number.isFinite(p)) return 0
  return Math.max(0, Math.min(100, Math.round(p)))
}

/**
 * Sincronizacao incremental (delta) da nova fornecedora LMS. E o canal que
 * SUBSTITUI o webhook (LMS->PMB esta desligado): puxa o que mudou desde o cursor
 * e atualiza progresso das matriculas LMS + detecta conclusao (emite certificado
 * do PMB). Tambem reflete (des)publicacao de cursos LMS ja existentes.
 *
 * Cursor: usa SystemSettings.lmsDayUpdateCursor como `since`. Avanca para
 * `generatedAt` da resposta SO no fim, em sucesso — uma falha no meio faz o
 * proximo run reprocessar o mesmo delta (idempotente: updates sao overwrite e a
 * emissao de certificado e dedup interna).
 */
export async function syncLmsDayUpdate(): Promise<LmsDayUpdateResult> {
  const log = contextLogger()

  const settings = await prisma.systemSettings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID },
    select: { lmsDayUpdateCursor: true, certificateAutoIssue: true },
  })

  const res = await lmsDayUpdate(settings.lmsDayUpdateCursor ?? undefined)

  let coursesUpdated = 0
  let progressUpdated = 0
  let certificatesIssued = 0

  // ── Cursos: reflete (des)publicacao em linhas LMS JA existentes. A criacao de
  // cursos novos fica a cargo do sync de catalogo (que busca capa/detalhe).
  for (const c of res.data.courses) {
    const visible = c.status === "published" && c.visible
    const updated = await prisma.course.updateMany({
      where: { lmsCourseId: c.id },
      data: { status: visible ? "ATIVO" : "INATIVO", syncedAt: new Date() },
    })
    coursesUpdated += updated.count
  }

  // ── Alunos: progresso + conclusao.
  // DB-006: em vez de um findFirst por (aluno x curso) do delta (N×M queries),
  // resolvemos os alunos, pre-carregamos TODAS as matriculas LMS elegiveis desses
  // alunos numa unica findMany e indexamos por (studentId, lmsCourseId). O loop
  // de aplicacao vira lookup em Map — mesma semantica, sem o N+1 de leitura.
  const resolved: { s: LmsDayStudent; studentId: string }[] = []
  for (const s of res.data.students) {
    const student = await resolveStudent(s)
    if (!student) {
      log.warn(
        { event: "lms.day_update.student_unmatched", externalId: s.studentExternalId, email: s.email },
        "aluno do delta LMS nao encontrado no PMB",
      )
      continue
    }
    resolved.push({ s, studentId: student.id })
  }

  const enrollmentByKey = await loadLmsEnrollmentsByKey(
    [...new Set(resolved.map((r) => r.studentId))],
  )

  for (const { s, studentId } of resolved) {
    for (const sc of s.courses) {
      const enrollmentId = enrollmentByKey.get(enrollmentKey(studentId, sc.courseId))
      if (!enrollmentId) continue

      const completed = sc.status === "completed"
      await prisma.enrollment.update({
        where: { id: enrollmentId },
        data: {
          progressPercent: clampPercent(sc.percent),
          progressStatus: completed
            ? "CONCLUIDO"
            : sc.status === "in_progress"
              ? "EM_ANDAMENTO"
              : "AGUARDANDO",
          ...(sc.lastActivityAt ? { lastLessonAt: new Date(sc.lastActivityAt) } : {}),
          progressSyncedAt: new Date(),
        },
      })
      progressUpdated += 1

      // Cota de aulas: reavalia com o progresso recém-sincronizado. No LMS este
      // é o caminho de hora em hora; o webhook `lesson.completed` cobre o tempo
      // quase real.
      await evaluatePaceGate(enrollmentId)

      // Conclusao => emite o certificado do PMB (dedup interna por enrollment).
      if (completed && settings.certificateAutoIssue) {
        try {
          await issueCertificateIfEligible(enrollmentId, "AUTO")
          certificatesIssued += 1
        } catch (err) {
          // Cota de aulas: recusa ESPERADA enquanto faltar parcela. O delta roda
          // de hora em hora — logar como erro encheria o log de ruido ate a
          // quitacao, quando o certificado sai sozinho.
          if (err instanceof PaceGateError) {
            log.info(
              { event: "lms.day_update.certificate_pace_blocked", enrollmentId },
              "certificado adiado — parcelamento em aberto",
            )
          } else {
            log.error(
              { err, event: "lms.day_update.certificate_failed", enrollmentId },
              "emissao de certificado (conclusao LMS) falhou",
            )
          }
        }
      }
    }
  }

  // Avanca o cursor SO no fim, em sucesso.
  await prisma.systemSettings.update({
    where: { id: SETTINGS_ID },
    data: { lmsDayUpdateCursor: res.generatedAt, lmsDayUpdateSyncedAt: new Date() },
  })

  log.info(
    { event: "lms.day_update.done", coursesUpdated, progressUpdated, certificatesIssued, since: settings.lmsDayUpdateCursor, generatedAt: res.generatedAt },
    "delta LMS sincronizado",
  )

  return { coursesUpdated, progressUpdated, certificatesIssued, generatedAt: res.generatedAt }
}

function enrollmentKey(studentId: string, lmsCourseId: string): string {
  return `${studentId}::${lmsCourseId}`
}

/**
 * DB-006: carrega em lote as matriculas LMS elegiveis dos alunos resolvidos e as
 * indexa por (studentId, lmsCourseId). Substitui o findFirst por (aluno x curso)
 * do loop antigo. Mantem a primeira ocorrencia por chave — equivalente ao
 * findFirst sem orderBy do codigo original quando ha matriculas duplicadas.
 */
async function loadLmsEnrollmentsByKey(
  studentIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (studentIds.length === 0) return map
  const enrollments = await prisma.enrollment.findMany({
    where: {
      studentId: { in: studentIds },
      status: { in: ["ACTIVE", "COMPLETED", "SUSPENDED"] },
      course: { lmsCourseId: { not: null } },
    },
    select: { id: true, studentId: true, course: { select: { lmsCourseId: true } } },
  })
  for (const e of enrollments) {
    const lmsCourseId = e.course?.lmsCourseId
    if (!lmsCourseId) continue
    const key = enrollmentKey(e.studentId, lmsCourseId)
    if (!map.has(key)) map.set(key, e.id)
  }
  return map
}

/**
 * Casa o aluno do delta com o nosso Student. Caminho forte: studentExternalId
 * === Student.id (cuid que enviamos ao matricular). Fallback: email (best-effort
 * — pode ser ambiguo em multi-tenant, entao so usamos quando casa exatamente um).
 */
async function resolveStudent(
  s: LmsDayStudent,
): Promise<{ id: string } | null> {
  if (s.studentExternalId) {
    const byId = await prisma.student.findUnique({
      where: { id: s.studentExternalId },
      select: { id: true },
    })
    if (byId) return byId
  }
  if (s.email) {
    const matches = await prisma.student.findMany({
      where: { email: s.email },
      select: { id: true },
      take: 2,
    })
    if (matches.length === 1) return matches[0]
  }
  return null
}
