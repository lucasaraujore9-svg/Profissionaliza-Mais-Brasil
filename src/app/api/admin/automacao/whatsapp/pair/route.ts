import { NextResponse } from "next/server"
import { randomBytes } from "node:crypto"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { withRequestContext } from "@/lib/observability/with-request-context"
import {
  startSession,
  requestPairingCode,
  getSessionStatus,
  WhatsAppNumberNotFoundError,
} from "@/lib/automation/wa-client"
import { contextLogger } from "@/lib/logger"

const schema = z.object({
  phone: z.string().trim().min(8).max(20),
})

export const POST = withRequestContext(
  {
    action: "admin.automacao.wa.pair",
    route: "/api/admin/automacao/whatsapp/pair",
  },
  async (request: Request) => {
    const ctx = await requireAdminSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }
    if (ctx.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
    }

    let raw: unknown
    try {
      raw = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Informe um telefone válido com DDI e DDD" },
        { status: 400 },
      )
    }

    const settings = await prisma.systemSettings.upsert({
      where: { id: "default" },
      create: { id: "default" },
      update: {},
      select: { pmbAutomationEnabled: true, pmbWaSessionName: true },
    })

    if (!settings.pmbAutomationEnabled) {
      return NextResponse.json(
        { error: "Automação PMB desativada" },
        { status: 403 },
      )
    }

    let sessionName = settings.pmbWaSessionName
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
        { err, event: "admin.automacao.wa.pair_start_failed", sessionName },
        "Falha ao iniciar sessao no engine",
      )
      return NextResponse.json(
        { error: "Falha ao conectar ao gateway de WhatsApp. Tente novamente." },
        { status: 502 },
      )
    }

    let code: string
    try {
      const result = await requestPairingCode({
        sessionName,
        phone: parsed.data.phone,
      })
      code = result.code
    } catch (err) {
      if (err instanceof WhatsAppNumberNotFoundError) {
        return NextResponse.json(
          { error: "Este número não possui WhatsApp ativo. Confira e tente de novo." },
          { status: 422 },
        )
      }
      contextLogger().error(
        { err, event: "admin.automacao.wa.pair_failed", sessionName },
        "Falha ao solicitar codigo de pareamento",
      )
      return NextResponse.json(
        { error: "Não foi possível gerar o código. Tente novamente." },
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
      data: { code, status: status.status },
    })
  },
)
