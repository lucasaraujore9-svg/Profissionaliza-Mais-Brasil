import { NextResponse } from "next/server"
import { randomBytes } from "node:crypto"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
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
    action: "painel.automacao.wa.pair",
    route: "/api/painel/automacao/whatsapp/pair",
  },
  async (request: Request) => {
    const guard = await requirePainel("automacao.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard

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

    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: {
        id: true,
        slug: true,
        automationEnabled: true,
        waSessionName: true,
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
        { err, event: "painel.automacao.wa.pair_start_failed", sessionName },
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
        { err, event: "painel.automacao.wa.pair_failed", sessionName },
        "Falha ao solicitar codigo de pareamento",
      )
      return NextResponse.json(
        { error: "Não foi possível gerar o código. Tente novamente." },
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
      data: { code, status: status.status },
    })
  },
)
