import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { reconcileLeadStages } from "@/lib/automation/leads"
import { StudentLeadStage } from "@prisma/client"

const ALL_STAGES: StudentLeadStage[] = [
  "NEW",
  "CONTACTED",
  "CHECKOUT_STARTED",
  "ABANDONED",
  "WON",
  "LOST",
]

export const GET = withRequestContext(
  { action: "admin.leads.list", route: "/api/admin/leads" },
  async (request: Request) => {
    const ctx = await requireAdminSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }
    // Apenas SUPER_ADMIN e PMB_SALES (vendas diretas PMB) acessam os leads do PMB.
    if (ctx.role !== "SUPER_ADMIN" && ctx.role !== "PMB_SALES") {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
    }

    // Reconcilia colunas com o estado real (paga → WON, expirada → ABANDONED)
    // antes de montar o board. Cobre webhooks perdidos / cron atrasado.
    const settings = await prisma.systemSettings.findUnique({
      where: { id: "default" },
      select: { pmbAbandonedAfterHours: true },
    })
    await reconcileLeadStages(null, settings?.pmbAbandonedAfterHours ?? 24)

    const url = new URL(request.url)
    const courseSlug = url.searchParams.get("courseSlug")
    const source = url.searchParams.get("source")

    let courseId: string | undefined
    if (courseSlug) {
      const c = await prisma.course.findUnique({
        where: { slug: courseSlug },
        select: { id: true },
      })
      if (!c) return NextResponse.json({ data: emptyBoard() })
      courseId = c.id
    }

    const leads = await prisma.studentLead.findMany({
      where: {
        tenantId: null, // PMB
        ...(courseId ? { courseId } : {}),
        ...(source ? { source: source as never } : {}),
      },
      orderBy: [{ stage: "asc" }, { columnOrder: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        nome: true,
        email: true,
        telefone: true,
        courseSnapshot: true,
        stage: true,
        source: true,
        paymentValue: true,
        columnOrder: true,
        createdAt: true,
      },
    })

    const serialized = leads.map(serializeLead)
    const board = emptyBoard()
    for (const lead of serialized) {
      board[lead.stage].push(lead)
    }

    return NextResponse.json({ data: board })
  },
)

type SerializedLead = ReturnType<typeof serializeLead>

function emptyBoard(): Record<StudentLeadStage, SerializedLead[]> {
  return ALL_STAGES.reduce(
    (acc, stage) => {
      acc[stage] = []
      return acc
    },
    {} as Record<StudentLeadStage, SerializedLead[]>,
  )
}

function serializeLead(lead: {
  id: string
  nome: string
  email: string
  telefone: string
  courseSnapshot: string | null
  stage: StudentLeadStage
  source: string
  paymentValue: { toString(): string } | null
  columnOrder: number
  createdAt: Date
}) {
  return {
    id: lead.id,
    nome: lead.nome,
    email: lead.email,
    telefone: lead.telefone,
    courseSnapshot: lead.courseSnapshot,
    stage: lead.stage,
    source: lead.source,
    paymentValue: lead.paymentValue ? Number(lead.paymentValue.toString()) : null,
    columnOrder: lead.columnOrder,
    createdAt: lead.createdAt.toISOString(),
  }
}
