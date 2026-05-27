import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

export const GET = withRequestContextParams<{ id: string }>(
  { action: "painel.leads.get", route: "/api/painel/leads/[id]" },
  async (_request: Request, { params }) => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const { id } = await params
    const lead = await prisma.studentLead.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        activities: {
          orderBy: { createdAt: "desc" },
          take: 50,
        },
        course: { select: { slug: true, nome: true } },
        enrollment: {
          select: { id: true, status: true, finalAmount: true },
        },
      },
    })

    if (!lead) {
      return NextResponse.json(
        { error: "Lead não encontrado" },
        { status: 404 },
      )
    }

    return NextResponse.json({
      data: {
        id: lead.id,
        nome: lead.nome,
        email: lead.email,
        telefone: lead.telefone,
        notes: lead.notes,
        stage: lead.stage,
        source: lead.source,
        paymentValue: lead.paymentValue ? Number(lead.paymentValue.toString()) : null,
        courseSnapshot: lead.courseSnapshot,
        course: lead.course,
        enrollment: lead.enrollment
          ? {
              id: lead.enrollment.id,
              status: lead.enrollment.status,
              finalAmount: Number(lead.enrollment.finalAmount.toString()),
            }
          : null,
        createdAt: lead.createdAt.toISOString(),
        updatedAt: lead.updatedAt.toISOString(),
        activities: lead.activities.map((a) => ({
          id: a.id,
          kind: a.kind,
          body: a.body,
          metadata: a.metadata,
          createdAt: a.createdAt.toISOString(),
        })),
      },
    })
  },
)

export const DELETE = withRequestContextParams<{ id: string }>(
  { action: "painel.leads.delete", route: "/api/painel/leads/[id]" },
  async (_request: Request, { params }) => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const { id } = await params
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

    // Soft-delete: vira LOST. Hard delete fica para limpeza administrativa.
    await prisma.$transaction([
      prisma.studentLead.update({
        where: { id },
        data: { stage: "LOST" },
      }),
      prisma.studentLeadActivity.create({
        data: {
          leadId: id,
          kind: "STAGE_CHANGED",
          authorUserId: ctx.userId,
          metadata: { fromStage: lead.stage, toStage: "LOST", reason: "manual_discard" },
        },
      }),
    ])

    return NextResponse.json({ data: { id, stage: "LOST" } })
  },
)
