import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { getLeadCourseTimeline } from "@/lib/automation/leads"
import { getLeadNavigationTimeline } from "@/lib/automation/tracking"
import { listLeadAssignees } from "@/lib/automation/assign"

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

    const [courseTimeline, navigation] = await Promise.all([
      getLeadCourseTimeline(ctx.tenantId, lead.email, lead.telefone),
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
        ownerUserId: lead.ownerUserId,
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

const patchSchema = z.object({
  // null = remover responsavel (volta para a fila do owner).
  ownerUserId: z.string().min(1).nullable(),
})

export const PATCH = withRequestContextParams<{ id: string }>(
  { action: "painel.leads.update", route: "/api/painel/leads/[id]" },
  async (request: Request, { params }) => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const parsed = patchSchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const { id } = await params
    const lead = await prisma.studentLead.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, ownerUserId: true },
    })
    if (!lead) {
      return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 })
    }

    const nextOwnerId = parsed.data.ownerUserId
    const assignees = await listLeadAssignees(ctx.tenantId)

    // So permite atribuir a um consultor real da unidade (ou desatribuir).
    if (nextOwnerId && !assignees.some((a) => a.userId === nextOwnerId)) {
      return NextResponse.json(
        { error: "Consultor inválido para esta unidade" },
        { status: 400 },
      )
    }

    if (nextOwnerId === lead.ownerUserId) {
      return NextResponse.json({ data: { id, ownerUserId: nextOwnerId } })
    }

    const nextName = nextOwnerId
      ? (assignees.find((a) => a.userId === nextOwnerId)?.name ?? "Consultor")
      : null

    await prisma.$transaction([
      prisma.studentLead.update({
        where: { id },
        data: { ownerUserId: nextOwnerId },
      }),
      prisma.studentLeadActivity.create({
        data: {
          leadId: id,
          kind: "NOTE",
          authorUserId: ctx.userId,
          body: nextName
            ? `Responsável definido como ${nextName}.`
            : "Responsável removido (de volta à fila da unidade).",
          metadata: { fromOwnerUserId: lead.ownerUserId, toOwnerUserId: nextOwnerId },
        },
      }),
    ])

    return NextResponse.json({ data: { id, ownerUserId: nextOwnerId } })
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
