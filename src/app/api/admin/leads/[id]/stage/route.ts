import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { StudentLeadStage } from "@prisma/client"

const bodySchema = z.object({
  stage: z.nativeEnum(StudentLeadStage),
  columnOrder: z.number().int().nonnegative().optional(),
})

export const PATCH = withRequestContextParams<{ id: string }>(
  { action: "admin.leads.stage", route: "/api/admin/leads/[id]/stage" },
  async (request: Request, { params }) => {
    const ctx = await requireAdminSession()
    if (!ctx) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    if (ctx.role !== "SUPER_ADMIN" && ctx.role !== "PMB_SALES") {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
    }

    const { id } = await params

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

    const lead = await prisma.studentLead.findFirst({
      where: { id, tenantId: null },
      select: { id: true, stage: true },
    })

    if (!lead) return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 })

    if (lead.stage === parsed.data.stage && parsed.data.columnOrder === undefined) {
      return NextResponse.json({ data: { id, stage: lead.stage } })
    }

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.studentLead.update({
        where: { id },
        data: {
          stage: parsed.data.stage,
          ...(parsed.data.columnOrder !== undefined
            ? { columnOrder: parsed.data.columnOrder }
            : {}),
        },
        select: { id: true, stage: true, columnOrder: true },
      })

      if (lead.stage !== parsed.data.stage) {
        await tx.studentLeadActivity.create({
          data: {
            leadId: id,
            kind: "STAGE_CHANGED",
            authorUserId: ctx.userId,
            metadata: {
              fromStage: lead.stage,
              toStage: parsed.data.stage,
              reason: "manual",
            },
          },
        })
      }

      return u
    })

    return NextResponse.json({ data: updated })
  },
)
