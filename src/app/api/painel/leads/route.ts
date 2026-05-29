import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
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
  { action: "painel.leads.list", route: "/api/painel/leads" },
  async (request: Request) => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    // Reconcilia colunas com o estado real (paga → WON, expirada → ABANDONED)
    // antes de montar o board. Cobre webhooks perdidos / cron atrasado.
    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { abandonedAfterHours: true },
    })
    await reconcileLeadStages(ctx.tenantId, tenant?.abandonedAfterHours ?? 24)

    const url = new URL(request.url)
    const courseSlug = url.searchParams.get("courseSlug")
    const source = url.searchParams.get("source")

    let courseId: string | undefined
    if (courseSlug) {
      const c = await prisma.course.findUnique({
        where: { slug: courseSlug },
        select: { id: true },
      })
      if (!c) {
        return NextResponse.json({ data: emptyBoard() })
      }
      courseId = c.id
    }

    const leads = await prisma.studentLead.findMany({
      where: {
        tenantId: ctx.tenantId,
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
