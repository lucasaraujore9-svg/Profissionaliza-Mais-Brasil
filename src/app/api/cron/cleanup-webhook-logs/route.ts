import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { isCronAuthorized } from "@/lib/auth/bearer"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"

export const maxDuration = 60
export const dynamic = "force-dynamic"

const RETENTION_DAYS = 90

/**
 * Purga registros antigos de WebhookLog. Mantemos somente os últimos 90 dias
 * para auditoria — payloads vão crescendo com o volume de webhooks (MP, Asaas)
 * e nunca eram limpos. Reduz custo de armazenamento e mantém queries rápidas.
 *
 * Apenas remove logs com `processed: true` para não perder evidência de
 * eventos que falharam (esses ficam até serem reprocessados manualmente).
 */
export const POST = withRequestContext(
  { action: "cron.cleanup_webhook_logs", route: "/api/cron/cleanup-webhook-logs" },
  async (request: Request) => {
    if (!isCronAuthorized(request)) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const log = contextLogger()
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS)

    log.info({ event: "cron.cleanup_webhook_logs.start", cutoff: cutoff.toISOString(), retentionDays: RETENTION_DAYS }, "iniciando cleanup de webhook logs")

    try {
      const result = await prisma.webhookLog.deleteMany({
        where: {
          processed: true,
          createdAt: { lt: cutoff },
        },
      })

      log.info(
        { event: "cron.cleanup_webhook_logs.done", deleted: result.count, cutoff: cutoff.toISOString() },
        "cleanup concluído",
      )

      return NextResponse.json({
        data: {
          deleted: result.count,
          cutoff: cutoff.toISOString(),
          retentionDays: RETENTION_DAYS,
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
