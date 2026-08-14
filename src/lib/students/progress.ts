import { prisma } from "@/lib/prisma"
import { cursosVinculados } from "@/lib/plataforma-cursos/client"
import type { EACursoVinculado } from "@/lib/plataforma-cursos/types"
import { issueCertificateIfEligible, PaceGateError } from "@/lib/certificates/issue"
import { evaluatePaceGate } from "@/lib/enrollment/pace"
import {
  PACE_PRIMARY_SELECT,
  isPaceGatedPlan,
} from "@/lib/enrollment/pace-gate"
import { get as cacheGet, set as cacheSet } from "@/lib/redis/cache"
import { contextLogger } from "@/lib/logger"

const PROGRESS_TTL_SECONDS = 300 // 5 min — espelha o "skip" abaixo
const PROGRESS_SKIP_MS = 5 * 60 * 1000

const SETTINGS_ID = "default"

function progressCacheKey(studentId: string): string {
  return `student:progress:${studentId}`
}

/**
 * Normaliza string para match insensitive de curso:
 * lowercase + trim + sem acentos.
 */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase()
}

const SITUACAO_MAP: Record<string, "EM_ANDAMENTO" | "CONCLUIDO" | "AGUARDANDO"> = {
  "em andamento": "EM_ANDAMENTO",
  concluido: "CONCLUIDO",
  aguardando: "AGUARDANDO",
}

function mapSituacao(
  raw: string | undefined,
): "EM_ANDAMENTO" | "CONCLUIDO" | "AGUARDANDO" | null {
  if (!raw) return null
  return SITUACAO_MAP[norm(raw)] ?? null
}

function parsePercent(raw: string | undefined): number | null {
  if (!raw) return null
  const m = raw.match(/(\d+)/)
  if (!m) return null
  const n = parseInt(m[1], 10)
  if (Number.isNaN(n)) return null
  return Math.max(0, Math.min(100, n))
}

function parseLastLesson(raw: string | undefined): Date | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  // formatos aceitos: "2023-05-22" ou "22/05/2023"
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    const d = new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00`)
    return isNaN(d.getTime()) ? null : d
  }
  const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (brMatch) {
    const d = new Date(`${brMatch[3]}-${brMatch[2]}-${brMatch[1]}T00:00:00`)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

export interface SyncProgressResult {
  updated: number
  certificatesIssued: number
}

/**
 * `syncStudentProgress` que NUNCA lança — para os pontos onde o progresso
 * fresco é desejável mas a operação não pode falhar por causa da plataforma de
 * aulas (telas de emissão de certificado, listagens).
 *
 * Existe porque a EA não tem webhook: a única forma de saber que o aluno
 * concluiu é perguntar. Sem isso, a decisão "concluiu?" era tomada sobre uma
 * cópia de até 24h (o cron das 07:00), e o operador que via "concluído" na
 * plataforma de aulas encontrava "em andamento" aqui — exatamente o caso que
 * originou esta função. O custo é 1 chamada à EA, já protegida pelo cache de
 * 5 min que a própria `syncStudentProgress` aplica.
 */
export async function syncStudentProgressBestEffort(
  studentId: string,
  event: string,
): Promise<void> {
  try {
    await syncStudentProgress(studentId)
  } catch (err) {
    contextLogger().warn(
      { err, event, studentId },
      "sync de progresso falhou — segue com a cópia local (pode estar desatualizada)",
    )
  }
}

/**
 * Sincroniza o progresso de um aluno consultando a plataforma parceira.
 * - Pula se ja sincronizado recentemente (cache 5min).
 * - Atualiza Enrollment.progressPercent / progressStatus / lastLessonAt / progressSyncedAt.
 * - Emite certificado automaticamente quando elegivel (configuravel).
 */
export async function syncStudentProgress(
  studentId: string,
): Promise<SyncProgressResult> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      plataformaAlunoId: true,
    },
  })
  if (!student || !student.plataformaAlunoId) {
    return { updated: 0, certificatesIssued: 0 }
  }

  // Cache no Redis (best-effort)
  try {
    const cached = await cacheGet(progressCacheKey(studentId))
    if (cached) {
      return { updated: 0, certificatesIssued: 0 }
    }
  } catch {
    // ignora — cache e otimizacao
  }

  // Cache de banco (fallback se Redis off): se sincronizado < 5min, pula
  const enrollments = await prisma.enrollment.findMany({
    where: {
      studentId,
      status: { in: ["ACTIVE", "COMPLETED"] },
    },
    include: {
      course: { select: { id: true, nome: true } },
      // O pré-filtro `isPaceGatedPlan(e)` mais abaixo decide quem vai à
      // reavaliação da cota. Sem o plano da primária, toda satélite de compra
      // parcelada seria descartada como "curso à vista" e nunca reavaliada.
      ...PACE_PRIMARY_SELECT,
    },
  })
  if (enrollments.length === 0) {
    return { updated: 0, certificatesIssued: 0 }
  }

  const mostRecentSync = enrollments.reduce<Date | null>((acc, e) => {
    if (!e.progressSyncedAt) return acc
    if (!acc || e.progressSyncedAt > acc) return e.progressSyncedAt
    return acc
  }, null)
  if (mostRecentSync && Date.now() - mostRecentSync.getTime() < PROGRESS_SKIP_MS) {
    // Marca no Redis e sai
    try {
      await cacheSet(progressCacheKey(studentId), "1", PROGRESS_TTL_SECONDS)
    } catch {
      // ignora
    }
    return { updated: 0, certificatesIssued: 0 }
  }

  const idAluno = parseInt(student.plataformaAlunoId, 10)
  if (Number.isNaN(idAluno)) {
    // plataformaAlunoId nao numerico — nao consegue consultar API
    await prisma.enrollment.updateMany({
      where: { studentId, status: { in: ["ACTIVE", "COMPLETED"] } },
      data: { progressSyncedAt: new Date() },
    })
    return { updated: 0, certificatesIssued: 0 }
  }

  let lista: EACursoVinculado[] = []
  try {
    lista = await cursosVinculados(idAluno)
  } catch (err) {
    contextLogger().warn(
      { err, event: "student-progress.cursosVinculados_failed", plataformaAlunoId: idAluno, studentId },
      "falha ao consultar cursosVinculados",
    )
    await prisma.enrollment.updateMany({
      where: { studentId, status: { in: ["ACTIVE", "COMPLETED"] } },
      data: { progressSyncedAt: new Date() },
    })
    return { updated: 0, certificatesIssued: 0 }
  }

  if (!Array.isArray(lista) || lista.length === 0) {
    await prisma.enrollment.updateMany({
      where: { studentId, status: { in: ["ACTIVE", "COMPLETED"] } },
      data: { progressSyncedAt: new Date() },
    })
    try {
      await cacheSet(progressCacheKey(studentId), "1", PROGRESS_TTL_SECONDS)
    } catch (err) {
      contextLogger().warn(
        { err, event: "student-progress.cache_set_failed", studentId },
        "cache de progresso falhou (degrada — sync vai tentar de novo)",
      )
    }
    return { updated: 0, certificatesIssued: 0 }
  }

  // Indexa por nome normalizado do curso
  const byName = new Map<string, EACursoVinculado>()
  for (const item of lista) {
    const key = norm(item.Curso ?? "")
    if (!key) continue
    if (!byName.has(key)) byName.set(key, item)
  }

  const settings = await prisma.systemSettings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID },
    select: {
      certificateMinPercent: true,
      certificateAutoIssue: true,
    },
  })

  // Match Enrollment <-> item EA por nome normalizado.
  // Se houver multiplos enrollments para o mesmo curso, pega o primeiro ACTIVE.
  const enrollmentsSorted = [...enrollments].sort((a, b) => {
    const aRank = a.status === "ACTIVE" ? 0 : 1
    const bRank = b.status === "ACTIVE" ? 0 : 1
    return aRank - bRank
  })

  const seen = new Set<string>() // courseId ja casado
  const updates: Array<{ enrollmentId: string; data: Record<string, unknown> }> = []
  const toIssueCert: string[] = []
  const now = new Date()

  for (const e of enrollmentsSorted) {
    const key = norm(e.course.nome)
    const item = byName.get(key)
    if (!item) {
      // sem dados da EA — apenas marca sync
      updates.push({
        enrollmentId: e.id,
        data: { progressSyncedAt: now },
      })
      continue
    }
    if (seen.has(e.courseId)) {
      // ja casamos este curso com outro enrollment — apenas marca sync
      updates.push({
        enrollmentId: e.id,
        data: { progressSyncedAt: now },
      })
      continue
    }
    seen.add(e.courseId)

    const percent = parsePercent(item.Porcentagem)
    const status = mapSituacao(item["Situação"])
    const lastLesson = parseLastLesson(item["Data da última aula"])

    const data: Record<string, unknown> = {
      progressSyncedAt: now,
    }
    if (percent !== null) data.progressPercent = percent
    if (status !== null) data.progressStatus = status
    if (lastLesson) data.lastLessonAt = lastLesson

    updates.push({ enrollmentId: e.id, data })

    // Elegibilidade para auto-emissao
    if (
      settings.certificateAutoIssue &&
      status === "CONCLUIDO" &&
      percent !== null &&
      percent >= settings.certificateMinPercent
    ) {
      // checa se ja nao ha certificado nao revogado
      const cert = await prisma.certificate.findFirst({
        where: { enrollmentId: e.id, revokedAt: null },
        select: { id: true },
      })
      if (!cert) toIssueCert.push(e.id)
    }
  }

  // Aplica updates
  for (const u of updates) {
    await prisma.enrollment.update({
      where: { id: u.enrollmentId },
      data: u.data,
    })
  }

  // Cota de aulas: com o progresso recém-atualizado, reavalia quem passou da
  // fatia paga. Este é o gatilho principal na EA — a plataforma não tem webhook,
  // então o progresso só chega por este pull (cron diário e, na prática, a cada
  // abertura de /aluno/cursos, com cache de 5 min). Pré-filtra pelo plano com a
  // função pura para não consultar configuração de quem não é parcelado.
  for (const e of enrollmentsSorted) {
    if (!isPaceGatedPlan(e)) continue
    await evaluatePaceGate(e.id)
  }

  // Emite certificados (sequencial para nao saturar render PDF)
  let certificatesIssued = 0
  for (const enrollmentId of toIssueCert) {
    try {
      await issueCertificateIfEligible(enrollmentId, "AUTO")
      certificatesIssued++
    } catch (err) {
      // Cota de aulas: parcelamento em aberto é recusa ESPERADA (o aluno
      // concluiu mas ainda deve parcelas) — não polui o log de erro a cada
      // sincronização. O certificado sai sozinho quando a última parcela cair.
      if (err instanceof PaceGateError) {
        contextLogger().info(
          { event: "student-progress.cert_pace_blocked", enrollmentId, studentId },
          "certificado adiado — parcelamento em aberto",
        )
        continue
      }
      contextLogger().error(
        { err, event: "student-progress.cert_issue_failed", enrollmentId, studentId },
        "falha ao emitir certificado para enrollment",
      )
    }
  }

  try {
    await cacheSet(progressCacheKey(studentId), "1", PROGRESS_TTL_SECONDS)
  } catch {
    // ignora
  }

  return {
    updated: updates.filter((u) => Object.keys(u.data).length > 1).length,
    certificatesIssued,
  }
}
