import { NextResponse } from "next/server"
import { authorizeCron } from "@/lib/observability/cron-heartbeat"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { runOverdueSweep } from "@/lib/tenants/overdue-sweep"

export const maxDuration = 300
export const dynamic = "force-dynamic"

/**
 * Varredura periódica da inadimplência das unidades (a cada 6h, pg_cron).
 *
 * Aplica a régua de `lib/tenants/overdue-policy`: suspende em D+3, manda o
 * último aviso em D+5 e CANCELA em D+7 (dias de atraso da mensalidade mais
 * antiga em aberto). Também cobre falhas de webhook do Asaas — a suspensão não
 * depende de o `PAYMENT_OVERDUE` ter chegado.
 *
 * Idempotente: cada ação remove a unidade do estado que a selecionou (ACTIVE ->
 * SUSPENDED -> CANCELLED) e o aviso é reivindicado por cobrança.
 *
 * `?dryRun=1` calcula tudo e relata QUEM SERIA cancelado sem escrever nada, sem
 * falar com o Asaas e sem avisar ninguém. É a forma de conferir o estrago antes
 * de uma primeira execução — sobretudo em cima de um backlog de atrasados.
 */
export const POST = withRequestContext(
  { action: "cron.sweep_tenants_overdue", route: "/api/cron/sweep-tenants-overdue" },
  async (request: Request) => {
    if (!(await authorizeCron(request))) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }
    const dryRun = new URL(request.url).searchParams.get("dryRun") === "1"
    const result = await runOverdueSweep({ dryRun })
    return NextResponse.json({ data: result })
  },
)

export async function GET(request: Request) {
  return POST(request)
}
