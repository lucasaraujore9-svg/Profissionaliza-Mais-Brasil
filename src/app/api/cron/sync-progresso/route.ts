import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { syncStudentProgress } from "@/lib/students/progress"
import { isCronAuthorized } from "@/lib/auth/bearer"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"

export const maxDuration = 300
export const dynamic = "force-dynamic"

const BATCH_SIZE = 100
const STALE_HOURS = 12
const DELAY_BETWEEN_STUDENTS_MS = 200

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface CronResult {
  processed: number
  certificatesIssued: number
  errors: number
}

async function runSyncProgresso(): Promise<CronResult> {
  const log = contextLogger()
  const staleBefore = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000)

  // Coleta studentIds distintos de Enrollments ACTIVE com sync stale ou nulo.
  const stale = await prisma.enrollment.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { progressSyncedAt: null },
        { progressSyncedAt: { lt: staleBefore } },
      ],
    },
    select: { studentId: true },
    take: BATCH_SIZE * 4,
  })

  const seen = new Set<string>()
  const studentIds: string[] = []
  for (const e of stale) {
    if (!seen.has(e.studentId)) {
      seen.add(e.studentId)
      studentIds.push(e.studentId)
    }
    if (studentIds.length >= BATCH_SIZE) break
  }

  log.info(
    { event: "cron.sync_progresso.start", batchSize: studentIds.length, staleHours: STALE_HOURS },
    "iniciando sync de progresso",
  )

  let processed = 0
  let certificatesIssued = 0
  let errors = 0

  for (const studentId of studentIds) {
    try {
      const result = await syncStudentProgress(studentId)
      processed++
      certificatesIssued += result.certificatesIssued
    } catch (err) {
      errors++
      log.error(
        { err, event: "cron.sync_progresso.student_failed", studentId },
        "sync de progresso de aluno falhou",
      )
    }
    if (DELAY_BETWEEN_STUDENTS_MS > 0) {
      await sleep(DELAY_BETWEEN_STUDENTS_MS)
    }
  }

  log.info(
    { event: "cron.sync_progresso.done", processed, certificatesIssued, errors },
    "sync de progresso concluído",
  )

  return { processed, certificatesIssued, errors }
}

export const POST = withRequestContext(
  { action: "cron.sync_progresso", route: "/api/cron/sync-progresso" },
  async (request: Request) => {
    if (!isCronAuthorized(request)) {
      return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
    }
    try {
      const result = await runSyncProgresso()
      return NextResponse.json({ data: result })
    } catch (err) {
      contextLogger().error(
        { err, event: "cron.sync_progresso.failed" },
        "cron sync-progresso falhou",
      )
      const message = err instanceof Error ? err.message : "Erro desconhecido"
      return NextResponse.json(
        { error: `Falha no sync de progresso: ${message}` },
        { status: 500 },
      )
    }
  },
)

export async function GET(request: Request) {
  return POST(request)
}
