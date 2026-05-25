import { NextResponse } from "next/server"
import { processMonthlyPayouts } from "@/lib/referrals/payout"
import { isCronAuthorized } from "@/lib/auth/bearer"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"

export const maxDuration = 300

export const POST = withRequestContext(
  { action: "cron.referral_monthly_payout", route: "/api/cron/referral-monthly-payout" },
  async (request: Request) => {
    if (!isCronAuthorized(request)) {
      return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
    }

    const log = contextLogger()
    log.info({ event: "cron.referral_payout.start" }, "iniciando payout mensal de comissões")

    try {
      const result = await processMonthlyPayouts()
      log.info({ event: "cron.referral_payout.done", ...result }, "payout mensal concluído")
      return NextResponse.json({ data: result })
    } catch (error) {
      log.error(
        { err: error, event: "cron.referral_payout.failed" },
        "payout mensal falhou",
      )
      const message =
        error instanceof Error ? error.message : "Erro desconhecido"
      return NextResponse.json(
        { error: `Falha no payout mensal: ${message}` },
        { status: 500 },
      )
    }
  },
)

export async function GET(request: Request) {
  return POST(request)
}
