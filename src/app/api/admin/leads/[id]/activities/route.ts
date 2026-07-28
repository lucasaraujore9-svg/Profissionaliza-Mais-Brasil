import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

const bodySchema = z.object({
  body: z.string().trim().min(1, "Mensagem vazia").max(2000),
})

export const POST = withRequestContextParams<{ id: string }>(
  { action: "admin.leads.activity.create", route: "/api/admin/leads/[id]/activities" },
  async (request: Request, { params }) => {
    const guard = await requireAdmin("leads.manage")
    if (!guard.ok) return guard.response
    const ctx = guard.ctx
    const { id } = await params
    const lead = await prisma.studentLead.findFirst({
      where: { id, tenantId: null },
      select: { id: true },
    })
    if (!lead) return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 })

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

    const activity = await prisma.studentLeadActivity.create({
      data: {
        leadId: id,
        kind: "NOTE",
        body: parsed.data.body,
        authorUserId: ctx.userId,
      },
    })

    return NextResponse.json({
      data: {
        id: activity.id,
        kind: activity.kind,
        body: activity.body,
        createdAt: activity.createdAt.toISOString(),
      },
    })
  },
)
