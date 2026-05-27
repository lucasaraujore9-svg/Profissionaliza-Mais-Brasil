import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

const bodySchema = z.object({
  body: z.string().trim().min(1, "Mensagem vazia").max(2000),
})

export const POST = withRequestContextParams<{ id: string }>(
  { action: "admin.leads.activity.create", route: "/api/admin/leads/[id]/activities" },
  async (request: Request, { params }) => {
    const ctx = await requireAdminSession()
    if (!ctx) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    if (ctx.role !== "SUPER_ADMIN" && ctx.role !== "PMB_SALES") {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
    }

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
