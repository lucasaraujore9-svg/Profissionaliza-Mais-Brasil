import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { StudentLeadStage } from "@prisma/client"

const bodySchema = z.object({
  stage: z.nativeEnum(StudentLeadStage),
  columnOrder: z.number().int().nonnegative().optional(),
})

export const PATCH = withRequestContextParams<{ id: string }>(
  { action: "painel.leads.stage", route: "/api/painel/leads/[id]/stage" },
  async (request: Request, { params }) => {
    const guard = await requirePainel("leads.view")
    if (!guard.ok) return guard.response
    const { ctx } = guard

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
        {
          error: "Dados inválidos",
          fields: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      )
    }

    const lead = await prisma.studentLead.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, stage: true },
    })

    if (!lead) {
      return NextResponse.json(
        { error: "Lead não encontrado" },
        { status: 404 },
      )
    }

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
