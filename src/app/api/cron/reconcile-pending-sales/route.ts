import { NextResponse } from "next/server"
import { authorizeCron } from "@/lib/observability/cron-heartbeat"
import { reconcilePendingSales } from "@/lib/enrollment/reconcile-sweep"
import { contextLogger } from "@/lib/logger"

export const maxDuration = 300
export const dynamic = "force-dynamic"

/**
 * Confere no Mercado Pago/Asaas toda venda PENDENTE dos ultimos 30 dias e libera
 * o curso das que ja foram pagas. Ver `lib/enrollment/reconcile-sweep.ts`.
 */
export async function POST(request: Request) {
  if (!(await authorizeCron(request))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }
  const result = await reconcilePendingSales()
  contextLogger().info(
    { event: "cron.reconcile_pending_sales", ...result, confirmed: result.confirmed.length },
    "reconciliação de vendas pendentes concluída",
  )
  return NextResponse.json({ data: result })
}

export async function GET(request: Request) {
  return POST(request)
}
