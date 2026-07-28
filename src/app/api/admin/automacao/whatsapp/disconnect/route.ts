import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { disconnectSession } from "@/lib/automation/wa-client"
import { requireAdmin } from "@/lib/auth/admin-guard"

export const POST = withRequestContext(
  {
    action: "admin.automacao.wa.disconnect",
    route: "/api/admin/automacao/whatsapp/disconnect",
  },
  async () => {
    const guard = await requireAdmin("automacao.manage")
    if (!guard.ok) return guard.response
    const settings = await prisma.systemSettings.findUnique({
      where: { id: "default" },
      select: { pmbWaSessionName: true },
    })

    if (settings?.pmbWaSessionName) {
      await disconnectSession(settings.pmbWaSessionName)
    }

    // Zera pmbWaSessionName porque a sessao foi apagada do engine —
    // proxima conexao gera nome novo e cria sessao do zero.
    await prisma.systemSettings.update({
      where: { id: "default" },
      data: {
        pmbWaSessionName: null,
        pmbWaStatus: "DISCONNECTED",
        pmbWaConnectedPhone: null,
        pmbWaStatusUpdatedAt: new Date(),
      },
    })

    return NextResponse.json({ data: { status: "DISCONNECTED" } })
  },
)
