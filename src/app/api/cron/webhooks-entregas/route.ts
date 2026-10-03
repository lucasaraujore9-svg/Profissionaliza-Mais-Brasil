import { NextResponse } from "next/server"
import { authorizeCron } from "@/lib/observability/cron-heartbeat"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { sweepWebhookDeliveries } from "@/lib/webhooks-saida/dispatch"

export const maxDuration = 300
export const dynamic = "force-dynamic"

/**
 * Novas tentativas dos webhooks de SAÍDA (a cada 5 min, pg_cron
 * `pmb-webhooks-entregas`). A 1ª tentativa sai na hora, junto do evento; este
 * job só pega o que falhou e venceu o backoff. Sem ele agendado, uma entrega
 * que falhar na 1ª tentativa fica PENDING para sempre.
 */
export const POST = withRequestContext(
  { action: "cron.webhooks_entregas", route: "/api/cron/webhooks-entregas" },
  async (request: Request) => {
    if (!(await authorizeCron(request))) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }
    return NextResponse.json({ data: await sweepWebhookDeliveries() })
  },
)
