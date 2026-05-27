import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { stopSession } from "@/lib/automation/wa-client"

export const POST = withRequestContext(
  {
    action: "admin.automacao.wa.disconnect",
    route: "/api/admin/automacao/whatsapp/disconnect",
  },
  async () => {
    const ctx = await requireAdminSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }
    if (ctx.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
    }

    const settings = await prisma.systemSettings.findUnique({
      where: { id: "default" },
      select: { pmbWaSessionName: true },
    })

    if (settings?.pmbWaSessionName) {
      await stopSession(settings.pmbWaSessionName)
    }

    await prisma.systemSettings.update({
      where: { id: "default" },
      data: {
        pmbWaStatus: "DISCONNECTED",
        pmbWaConnectedPhone: null,
        pmbWaStatusUpdatedAt: new Date(),
      },
    })

    return NextResponse.json({ data: { status: "DISCONNECTED" } })
  },
)
