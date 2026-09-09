import { NextResponse } from "next/server"
import { processMonthlyPayouts } from "@/lib/referrals/payout"
import {
  computeMonthlyCommissions,
  recentClosedPeriods,
} from "@/lib/referrals/monthly"
import { authorizeCron } from "@/lib/observability/cron-heartbeat"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"

export const maxDuration = 300

// Janela de catch-up: fecha os ultimos N meses (idempotente). Cobre o caso de o
// cron ter ficado fora do ar por um ou mais meses sem perder competencias.
//
// O job roda DUAS vezes por mes (dia 1 e dia da liberacao — ver
// prisma/sql/pg_cron_jobs.sql). A execucao do dia 1 e a que fecha a competencia
// recem-terminada; a do dia da liberacao promove PENDING -> AVAILABLE.
const CATCHUP_MONTHS = 3

export const POST = withRequestContext(
  { action: "cron.referral_monthly_payout", route: "/api/cron/referral-monthly-payout" },
  async (request: Request) => {
    if (!(await authorizeCron(request))) {
      return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
    }

    const log = contextLogger()
    log.info({ event: "cron.referral_payout.start" }, "iniciando payout mensal de comissões")

    try {
      // 1) Fecha os últimos meses no motor por faixas (MONTHLY_TIERED): apura uma
      // comissão por indicador por período. Idempotente + catch-up: se o cron
      // pulou um mês, o período perdido ainda é fechado neste run (do mais antigo
      // ao mais novo, para que processMonthlyPayouts já promova/some todos).
      const periods = recentClosedPeriods(new Date(), CATCHUP_MONTHS)
      const computes: Array<{ period: string } & Awaited<
        ReturnType<typeof computeMonthlyCommissions>
      >> = []
      for (const period of periods) {
        const compute = await computeMonthlyCommissions(period)
        computes.push({ period, ...compute })
      }
      log.info(
        { event: "cron.referral_payout.computed", periods, computes },
        "comissões mensais por faixas apuradas",
      )

      // 2) Promove PENDING→AVAILABLE (legado + faixas) e monta a lista de saques.
      // Rodando no dia 1, a competência recém-fechada ainda não venceu: ela
      // entra na lista pela janela de antecipação (payout-window.ts), com o
      // valor já fechado, para o financeiro poder pagar antes do dia da
      // liberação. Rodando no dia da liberação, é o comportamento de sempre.
      const result = await processMonthlyPayouts()
      log.info({ event: "cron.referral_payout.done", ...result }, "payout mensal concluído")
      return NextResponse.json({ data: { periods, computes, ...result } })
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
