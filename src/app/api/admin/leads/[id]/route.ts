import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { getLeadCourseTimeline } from "@/lib/automation/leads"
import { getLeadNavigationTimeline } from "@/lib/automation/tracking"

export const GET = withRequestContextParams<{ id: string }>(
  { action: "admin.leads.get", route: "/api/admin/leads/[id]" },
  async (_request: Request, { params }) => {
    const ctx = await requireAdminSession()
    if (!ctx) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    if (ctx.role !== "SUPER_ADMIN" && ctx.role !== "PMB_SALES") {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
    }

    const { id } = await params
    const lead = await prisma.studentLead.findFirst({
      where: { id, tenantId: null },
      include: {
        activities: { orderBy: { createdAt: "desc" }, take: 50 },
        course: { select: { slug: true, nome: true } },
        enrollment: {
          select: { id: true, status: true, finalAmount: true },
        },
      },
    })

    if (!lead) return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 })

    const [courseTimeline, navigation] = await Promise.all([
      getLeadCourseTimeline(null, lead.email, lead.telefone),
      getLeadNavigationTimeline(lead.id),
    ])

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
        courseTimeline,
        navigation,
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
  { action: "admin.leads.delete", route: "/api/admin/leads/[id]" },
  async (_request: Request, { params }) => {
    const ctx = await requireAdminSession()
    if (!ctx) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    if (ctx.role !== "SUPER_ADMIN" && ctx.role !== "PMB_SALES") {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
    }

    const { id } = await params
    const lead = await prisma.studentLead.findFirst({
      where: { id, tenantId: null },
      select: { id: true, stage: true },
    })

    if (!lead) {
      return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 })
    }

    await prisma.$transaction([
      prisma.studentLead.update({ where: { id }, data: { stage: "LOST" } }),
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
