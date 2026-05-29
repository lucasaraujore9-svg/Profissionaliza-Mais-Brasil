import { NextResponse } from "next/server"
import { randomBytes } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { withRequestContext } from "@/lib/observability/with-request-context"
import {
  startSession,
  getSessionStatus,
  disconnectSession,
} from "@/lib/automation/wa-client"
import { contextLogger } from "@/lib/logger"

export const POST = withRequestContext(
  {
    action: "painel.automacao.wa.connect",
    route: "/api/painel/automacao/whatsapp/connect",
  },
  async () => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: {
        id: true,
        slug: true,
        automationEnabled: true,
        waSessionName: true,
        waStatus: true,
      },
    })

    if (!tenant) {
      return NextResponse.json({ error: "Tenant não encontrado" }, { status: 404 })
    }

    if (!tenant.automationEnabled) {
      return NextResponse.json(
        { error: "Módulo Automação não habilitado" },
        { status: 403 },
      )
    }

    let sessionName = tenant.waSessionName

    // Recuperacao do estado FAILED (ex.: o QR expirou e a sessao no engine
    // ficou inutilizavel). So nesse estado: derruba a instancia atual
    // (logout + stop + delete) e descarta o sessionName, forcando a criacao
    // de uma sessao nova que emite um QR limpo.
    if (tenant.waStatus === "FAILED" && sessionName) {
      await disconnectSession(sessionName)
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: {
          waSessionName: null,
          waStatus: "DISCONNECTED",
          waConnectedPhone: null,
          waStatusUpdatedAt: new Date(),
        },
      })
      sessionName = null
    }

    if (!sessionName) {
      sessionName = `s_${tenant.slug}_${randomBytes(6).toString("hex")}`
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { waSessionName: sessionName },
      })
    }

    try {
      await startSession(sessionName)
    } catch (err) {
      contextLogger().error(
        { err, event: "painel.automacao.wa.start_failed", sessionName },
        "Falha ao iniciar sessao no engine",
      )
      return NextResponse.json(
        { error: "Falha ao conectar ao gateway de WhatsApp. Tente novamente." },
        { status: 502 },
      )
    }

    const status = await getSessionStatus(sessionName)

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        waStatus: status.status,
        waConnectedPhone: status.connectedPhone,
        waStatusUpdatedAt: new Date(),
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
