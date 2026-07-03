import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { isCronAuthorized } from "@/lib/auth/bearer"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"

export const maxDuration = 60
export const dynamic = "force-dynamic"

// DB-008: retenção de EmailLog. O campo `to` guarda e-mail em texto plano (PII)
// e a tabela crescia SEM limite (só webhook_logs era purgado) — custo de storage
// + risco LGPD de retenção sem prazo. Este endpoint é o MECANISMO (gated por
// cron secret); ele NÃO roda sozinho.
//
// ATIVAÇÃO = decisão do dono: definir o prazo de retenção (default 90d) e
// registrar o job no pg_cron (fonte: prisma/sql/pg_cron_jobs.sql), idempotente
// por jobname, ex.:
//   select cron.schedule(
//     'cleanup-email-logs',
//     '30 6 * * *',
//     $$ select app_internal.run_cron('/api/cron/cleanup-email-logs') $$
//   );
// Enquanto o job não for criado, nenhuma linha é apagada.
const RETENTION_DAYS = Number(process.env.EMAIL_LOG_RETENTION_DAYS ?? 90)

/**
 * Purga registros antigos de EmailLog (retenção `RETENTION_DAYS`). Espelha o
 * cleanup de webhook_logs. Apaga por `createdAt < cutoff` — todos os status
 * (o log de envio não é evidência forense a preservar como o webhook falho).
 */
export const POST = withRequestContext(
  { action: "cron.cleanup_email_logs", route: "/api/cron/cleanup-email-logs" },
  async (request: Request) => {
    if (!isCronAuthorized(request)) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const log = contextLogger()
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS)

    log.info(
      { event: "cron.cleanup_email_logs.start", cutoff: cutoff.toISOString(), retentionDays: RETENTION_DAYS },
      "iniciando cleanup de email logs",
    )

    try {
      const result = await prisma.emailLog.deleteMany({
        where: { createdAt: { lt: cutoff } },
      })

      log.info(
        { event: "cron.cleanup_email_logs.done", deleted: result.count, cutoff: cutoff.toISOString() },
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
        { err: error, event: "cron.cleanup_email_logs.failed" },
        "cleanup de email logs falhou",
      )
      return NextResponse.json(
        { error: `Falha ao limpar email logs: ${message}` },
        { status: 500 },
      )
    }
  },
)

export async function GET(request: Request) {
  return POST(request)
}
