import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/auth/admin-guard"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { retryDelivery } from "@/lib/webhooks-saida/dispatch"

// POST /api/admin/webhooks/entregas/{deliveryId}/reenviar — reenvia agora (mesmo Event-Id).
export const POST = withRequestContextParams<{ deliveryId: string }>(
  {
    action: "admin.webhooks.redeliver",
    route: "/api/admin/webhooks/entregas/[deliveryId]/reenviar",
  },
  async (_request, ctxParams) => {
    const guard = await requireAdmin("integracoes.manage")
    if (!guard.ok) return guard.response
    const { deliveryId } = await ctxParams.params

    const ok = await retryDelivery(deliveryId)
    if (!ok) {
      return NextResponse.json(
        { error: "Entrega não encontrada ou ainda na fila." },
        { status: 409 },
      )
    }
    const entrega = await prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      select: { id: true, status: true, lastStatusCode: true, lastError: true },
    })
    return NextResponse.json({ data: { entrega } })
  },
)
