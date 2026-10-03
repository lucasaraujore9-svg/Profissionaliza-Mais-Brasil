import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/auth/admin-guard"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { sendTestEvent } from "@/lib/webhooks-saida/dispatch"

// POST /api/admin/webhooks/{id}/teste — manda `webhook.teste` agora e devolve o resultado.
export const POST = withRequestContextParams<{ id: string }>(
  { action: "admin.webhooks.test", route: "/api/admin/webhooks/[id]/teste" },
  async (_request, ctxParams) => {
    const guard = await requireAdmin("integracoes.manage")
    if (!guard.ok) return guard.response
    const { id } = await ctxParams.params

    const endpoint = await prisma.webhookEndpoint.findUnique({
      where: { id },
      select: { status: true },
    })
    if (!endpoint) return NextResponse.json({ error: "Webhook não encontrado" }, { status: 404 })
    if (endpoint.status !== "ACTIVE") {
      return NextResponse.json({ error: "Ative o webhook antes de testar." }, { status: 409 })
    }

    const result = await sendTestEvent(id)
    return NextResponse.json({ data: { entrega: result } })
  },
)
