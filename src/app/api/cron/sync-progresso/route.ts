import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { syncStudentProgress } from "@/lib/students/progress"
import { isCronAuthorized } from "@/lib/auth/bearer"

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
      console.error(
        `[cron:sync-progresso] falha em syncStudentProgress(${studentId}):`,
        err,
      )
    }
    if (DELAY_BETWEEN_STUDENTS_MS > 0) {
      await sleep(DELAY_BETWEEN_STUDENTS_MS)
    }
  }

  return { processed, certificatesIssued, errors }
}

export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
  }
  try {
    const result = await runSyncProgresso()
    return NextResponse.json({ data: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido"
    return NextResponse.json(
      { error: `Falha no sync de progresso: ${message}` },
      { status: 500 },
    )
  }
}

export async function GET(request: Request) {
  return POST(request)
}
