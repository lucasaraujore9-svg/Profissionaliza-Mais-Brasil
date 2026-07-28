import { NextResponse } from "next/server"
import { randomBytes } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { withRequestContext } from "@/lib/observability/with-request-context"
import {
  startSession,
  getSessionStatus,
  disconnectSession,
} from "@/lib/automation/wa-client"
import { contextLogger } from "@/lib/logger"
import { requireAdmin } from "@/lib/auth/admin-guard"

export const POST = withRequestContext(
  {
    action: "admin.automacao.wa.connect",
    route: "/api/admin/automacao/whatsapp/connect",
  },
  async () => {
    const guard = await requireAdmin("automacao.manage")
    if (!guard.ok) return guard.response
    const settings = await prisma.systemSettings.upsert({
      where: { id: "default" },
      create: { id: "default" },
      update: {},
      select: {
        pmbAutomationEnabled: true,
        pmbWaSessionName: true,
        pmbWaStatus: true,
      },
    })

    if (!settings.pmbAutomationEnabled) {
      return NextResponse.json(
        { error: "Automação PMB desativada" },
        { status: 403 },
      )
    }

    let sessionName = settings.pmbWaSessionName

    // Recuperacao do estado FAILED (ex.: o QR expirou e a sessao no engine
    // ficou inutilizavel). So nesse estado: derruba a instancia atual
    // (logout + stop + delete) e descarta o sessionName, forcando a criacao
    // de uma sessao nova que emite um QR limpo.
    if (settings.pmbWaStatus === "FAILED" && sessionName) {
      await disconnectSession(sessionName)
      await prisma.systemSettings.update({
        where: { id: "default" },
        data: {
          pmbWaSessionName: null,
          pmbWaStatus: "DISCONNECTED",
          pmbWaConnectedPhone: null,
          pmbWaStatusUpdatedAt: new Date(),
        },
      })
      sessionName = null
    }

    if (!sessionName) {
      sessionName = `s_pmb_${randomBytes(6).toString("hex")}`
      await prisma.systemSettings.update({
        where: { id: "default" },
        data: { pmbWaSessionName: sessionName },
      })
    }

    try {
      await startSession(sessionName)
    } catch (err) {
      contextLogger().error(
        { err, event: "admin.automacao.wa.start_failed", sessionName },
        "Falha ao iniciar sessao no engine",
      )
      return NextResponse.json(
        { error: "Falha ao conectar ao gateway de WhatsApp. Tente novamente." },
        { status: 502 },
      )
    }

    const status = await getSessionStatus(sessionName)

    await prisma.systemSettings.update({
      where: { id: "default" },
      data: {
        pmbWaStatus: status.status,
        pmbWaConnectedPhone: status.connectedPhone,
        pmbWaStatusUpdatedAt: new Date(),
      },
    })

    return NextResponse.json({
      data: {
        status: status.status,
        connectedPhone: status.connectedPhone,
        qrDataUrl: status.qrDataUrl,
      },
    })
  },
)
