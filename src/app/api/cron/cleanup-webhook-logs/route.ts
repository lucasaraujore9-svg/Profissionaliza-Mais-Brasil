import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authorizeCron } from "@/lib/observability/cron-heartbeat"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"

export const maxDuration = 60
export const dynamic = "force-dynamic"

const RETENTION_DAYS = 90
// OBS-008/LGPD-014: webhooks que FALHARAM (`processed:false`) nunca eram
// purgados nem redigidos — retinham PII (Asaas/LMS) em repouso indefinidamente.
// Depois de 180 dias um webhook falho não é mais reprocessável (Asaas/MP já
// pararam de re-entregar), então redigimos o payload preservando a linha de
// auditoria (source/eventType/headers/error/createdAt).
const STALE_UNPROCESSED_DAYS = 180
const REDACT_MARKER = {
  _redacted: true,
  reason: `retention>${STALE_UNPROCESSED_DAYS}d`,
} as const

/**
 * Purga registros antigos de WebhookLog. Mantemos somente os últimos 90 dias
 * para auditoria — payloads vão crescendo com o volume de webhooks (MP, Asaas)
 * e nunca eram limpos. Reduz custo de armazenamento e mantém queries rápidas.
 *
 * Apenas remove logs com `processed: true` para não perder evidência de
 * eventos que falharam (esses ficam até serem reprocessados manualmente).
 *
 * Além disso, REDIGE (não apaga) o payload dos `processed:false` com mais de
 * STALE_UNPROCESSED_DAYS dias, para não reter PII de webhooks falhos — mantendo
 * a linha de auditoria.
 */
export const POST = withRequestContext(
  { action: "cron.cleanup_webhook_logs", route: "/api/cron/cleanup-webhook-logs" },
  async (request: Request) => {
    if (!(await authorizeCron(request))) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const log = contextLogger()
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS)

    log.info({ event: "cron.cleanup_webhook_logs.start", cutoff: cutoff.toISOString(), retentionDays: RETENTION_DAYS }, "iniciando cleanup de webhook logs")

    const staleCutoff = new Date()
    staleCutoff.setDate(staleCutoff.getDate() - STALE_UNPROCESSED_DAYS)

    try {
      const result = await prisma.webhookLog.deleteMany({
        where: {
          processed: true,
          createdAt: { lt: cutoff },
        },
      })

      // Redige (sem apagar) payloads de webhooks falhos antigos que ainda
      // carreguem PII. O guard por `_redacted` evita re-escrever a cada execução.
      const redacted = await prisma.webhookLog.updateMany({
        where: {
          processed: false,
          createdAt: { lt: staleCutoff },
          NOT: { payload: { path: ["_redacted"], equals: true } },
        },
        data: { payload: REDACT_MARKER },
      })

      log.info(
        {
          event: "cron.cleanup_webhook_logs.done",
          deleted: result.count,
          redactedStale: redacted.count,
          cutoff: cutoff.toISOString(),
          staleCutoff: staleCutoff.toISOString(),
        },
        "cleanup concluído",
      )

      return NextResponse.json({
        data: {
          deleted: result.count,
          redactedStale: redacted.count,
          cutoff: cutoff.toISOString(),
          staleCutoff: staleCutoff.toISOString(),
          retentionDays: RETENTION_DAYS,
          staleUnprocessedDays: STALE_UNPROCESSED_DAYS,
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "erro desconhecido"
      log.error(
        { err: error, event: "cron.cleanup_webhook_logs.failed" },
        "cleanup de webhook logs falhou",
      )
      return NextResponse.json(
        { error: `Falha ao limpar webhook logs: ${message}` },
        { status: 500 },
      )
    }
  },
)

export async function GET(request: Request) {
  return POST(request)
}
