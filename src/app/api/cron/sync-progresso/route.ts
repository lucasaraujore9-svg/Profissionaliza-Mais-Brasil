import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { syncStudentProgress } from "@/lib/students/progress"
import { authorizeCron } from "@/lib/observability/cron-heartbeat"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"

export const maxDuration = 300
export const dynamic = "force-dynamic"

const BATCH_SIZE = 250
const STALE_HOURS = 12
const DELAY_BETWEEN_STUDENTS_MS = 200
/**
 * Orçamento de tempo da rodada. `maxDuration` é 300s; paramos antes para
 * devolver a resposta (e o resumo) em vez de sermos mortos no meio — o trabalho
 * já feito está commitado por aluno, e o que sobrou entra na próxima rodada,
 * agora com prioridade porque a fila é ordenada pelo mais atrasado.
 */
const TIME_BUDGET_MS = 240_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface CronResult {
  processed: number
  certificatesIssued: number
  errors: number
  /** Alunos do lote que não couberam no orçamento de tempo desta rodada. */
  skipped: number
  ranOutOfTime: boolean
}

async function runSyncProgresso(): Promise<CronResult> {
  const log = contextLogger()
  const staleBefore = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000)

  // Coleta studentIds distintos de Enrollments ACTIVE com sync stale ou nulo.
  //
  // ORDENAÇÃO É REQUISITO, não estética: sem ela a busca devolvia 400 linhas
  // arbitrárias e, passando do tamanho do lote, os mesmos alunos podiam ser
  // preteridos indefinidamente — ficando meses sem sync. Como a EA não tem
  // webhook, esse aluno some do nosso radar por completo (e a cota de aulas,
  // que depende do progresso, nunca o alcança). Do mais atrasado para o menos,
  // com quem nunca sincronizou na frente, a fila é justa e converge.
  const stale = await prisma.enrollment.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { progressSyncedAt: null },
        { progressSyncedAt: { lt: staleBefore } },
      ],
    },
    select: { studentId: true },
    orderBy: { progressSyncedAt: { sort: "asc", nulls: "first" } },
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
  let ranOutOfTime = false

  const startedAt = Date.now()
  for (const studentId of studentIds) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      ranOutOfTime = true
      break
    }
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

  // Truncar em silêncio faria a rodada parecer completa. Registrar quantos
  // ficaram para trás é o que permite perceber que o lote precisa crescer.
  const skipped = studentIds.length - processed - errors
  if (ranOutOfTime) {
    log.warn(
      { event: "cron.sync_progresso.time_budget_hit", processed, skipped },
      "orçamento de tempo esgotado — alunos restantes entram na próxima rodada (fila é ordenada pelo mais atrasado)",
    )
  }

  log.info(
    { event: "cron.sync_progresso.done", processed, certificatesIssued, errors, skipped, ranOutOfTime },
    "sync de progresso concluído",
  )

  return { processed, certificatesIssued, errors, skipped, ranOutOfTime }
}

export const POST = withRequestContext(
  { action: "cron.sync_progresso", route: "/api/cron/sync-progresso" },
  async (request: Request) => {
    if (!(await authorizeCron(request))) {
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
