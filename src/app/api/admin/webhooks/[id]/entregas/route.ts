import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/auth/admin-guard"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

// GET /api/admin/webhooks/{id}/entregas — últimas 30 entregas (com o payload enviado).
export const GET = withRequestContextParams<{ id: string }>(
  { action: "admin.webhooks.deliveries", route: "/api/admin/webhooks/[id]/entregas" },
  async (_request, ctxParams) => {
    const guard = await requireAdmin("integracoes.view")
    if (!guard.ok) return guard.response
    const { id } = await ctxParams.params

    const entregas = await prisma.webhookDelivery.findMany({
      where: { endpointId: id },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        event: true,
        status: true,
        attempts: true,
        nextAttemptAt: true,
        lastStatusCode: true,
        lastError: true,
        deliveredAt: true,
        createdAt: true,
        payload: true,
      },
    })
    return NextResponse.json({ data: { entregas } })
  },
)
