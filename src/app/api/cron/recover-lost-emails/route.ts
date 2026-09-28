import { NextResponse } from "next/server"
import { authorizeCron } from "@/lib/observability/cron-heartbeat"
import { contextLogger } from "@/lib/logger"
import { recoverLostEmails } from "@/lib/email/recovery"

export const maxDuration = 300
export const dynamic = "force-dynamic"

/** Um lote cabe no maxDuration: 6 envios x 45s = 3m45s. */
const MAX_LIMIT = 6

/**
 * Recuperação dos e-mails perdidos no apagão da Hostinger (25–28/09/2026) — ver
 * `lib/email/recovery.ts`.
 *
 *   - default (dry-run): lista o que seria enviado, sem enviar nem escrever.
 *   - ?apply=true&limit=N: envia até N (máx. 6), 45s entre um e outro.
 *
 * Auth: CRON_SECRET (Bearer). Disparo via app_internal.run_cron, em lotes
 * pequenos agendados — nunca tudo de uma vez.
 */
async function handle(request: Request) {
  if (!(await authorizeCron(request))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const params = new URL(request.url).searchParams
  const apply = params.get("apply") === "true"
  const limit = Math.min(Math.max(Number(params.get("limit")) || 5, 1), MAX_LIMIT)

  const result = await recoverLostEmails({ apply, limit })

  contextLogger().info(
    {
      event: "cron.recover_lost_emails.done",
      apply,
      sent: result.outcomes.filter((o) => o.result === "sent").length,
      failed: result.outcomes.filter((o) => o.result === "failed").length,
      pendingAccess: result.pendingAccess,
      pendingEnrollment: result.pendingEnrollment,
    },
    "recuperacao de e-mails perdidos",
  )

  return NextResponse.json({ apply, limit, ...result })
}

export const GET = handle
export const POST = handle
