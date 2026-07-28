import { NextResponse } from "next/server"
import { authorizeCron } from "@/lib/observability/cron-heartbeat"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { runTenantPaymentReminders } from "@/lib/tenant-billing/reminders"

export const maxDuration = 300
export const dynamic = "force-dynamic"

/**
 * Lembretes de vencimento da mensalidade da unidade: 5 dias antes, 2 dias antes
 * e no dia. Agendado no pg_cron (ver prisma/sql/pg_cron_jobs.sql) para rodar
 * DEPOIS da reconciliação com o Asaas, para avisar sobre o estado já sincronizado.
 *
 * Idempotente: cada (cobrança, janela) é reivindicada em TenantPaymentReminder
 * antes do disparo — rodar de novo no mesmo dia não reenvia nada.
 */
export const POST = withRequestContext(
  {
    action: "cron.tenant_payment_reminders",
    route: "/api/cron/tenant-payment-reminders",
  },
  async (request: Request) => {
    if (!(await authorizeCron(request))) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }
    const result = await runTenantPaymentReminders()
    return NextResponse.json({ data: result })
  },
)

export async function GET(request: Request) {
  return POST(request)
}
