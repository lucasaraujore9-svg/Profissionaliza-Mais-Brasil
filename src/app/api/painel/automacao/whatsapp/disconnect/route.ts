import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { disconnectSession } from "@/lib/automation/wa-client"

export const POST = withRequestContext(
  {
    action: "painel.automacao.wa.disconnect",
    route: "/api/painel/automacao/whatsapp/disconnect",
  },
  async () => {
    const guard = await requirePainel("automacao.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { waSessionName: true },
    })

    if (tenant?.waSessionName) {
      await disconnectSession(tenant.waSessionName)
    }

    // Zera waSessionName porque a sessao foi apagada do engine — proxima
    // conexao gera nome novo e cria sessao do zero.
    await prisma.tenant.update({
      where: { id: ctx.tenantId },
      data: {
        waSessionName: null,
        waStatus: "DISCONNECTED",
        waConnectedPhone: null,
        waStatusUpdatedAt: new Date(),
      },
    })

    return NextResponse.json({ data: { status: "DISCONNECTED" } })
  },
)
