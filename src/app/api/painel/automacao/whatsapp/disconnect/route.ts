import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { stopSession } from "@/lib/automation/wa-client"

export const POST = withRequestContext(
  {
    action: "painel.automacao.wa.disconnect",
    route: "/api/painel/automacao/whatsapp/disconnect",
  },
  async () => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { waSessionName: true },
    })

    if (tenant?.waSessionName) {
      await stopSession(tenant.waSessionName)
    }

    await prisma.tenant.update({
      where: { id: ctx.tenantId },
      data: {
        waStatus: "DISCONNECTED",
        waConnectedPhone: null,
        waStatusUpdatedAt: new Date(),
      },
    })

    return NextResponse.json({ data: { status: "DISCONNECTED" } })
  },
)
