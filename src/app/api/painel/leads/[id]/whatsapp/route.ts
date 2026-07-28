import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { sendManualWhatsAppToLead } from "@/lib/automation/dispatch"

const bodySchema = z.object({
  message: z.string().trim().min(1, "Mensagem vazia").max(2000),
})

export const POST = withRequestContextParams<{ id: string }>(
  { action: "painel.leads.whatsapp", route: "/api/painel/leads/[id]/whatsapp" },
  async (request: Request, { params }) => {
    const guard = await requirePainel("leads.view")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    const { id } = await params
    const lead = await prisma.studentLead.findFirst({
      where: { id, tenantId: ctx.tenantId, ...ctx.scope.leads },
      select: { id: true },
    })
    if (!lead) {
      return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 })
    }

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }
    const parsed = bodySchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const result = await sendManualWhatsAppToLead(id, parsed.data.message)
    if (result.ok) {
      return NextResponse.json({ data: { sent: true } })
    }

    const status =
      result.code === "no_whatsapp" ? 422 : result.code === "wa_not_connected" ? 409 : 502
    return NextResponse.json({ error: result.message, code: result.code }, { status })
  },
)
