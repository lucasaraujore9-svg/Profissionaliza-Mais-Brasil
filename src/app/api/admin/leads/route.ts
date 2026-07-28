import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { reconcileLeadStages } from "@/lib/automation/leads"
import { StudentLeadStage } from "@prisma/client"
import { requireAdmin } from "@/lib/auth/admin-guard"

const ALL_STAGES: StudentLeadStage[] = [
  "NEW",
  "CONTACTED",
  "CHECKOUT_STARTED",
  "ABANDONED",
  "WON",
  "LOST",
]

// PERF-004: teto por coluna do kanban. Sem isto o board carregava TODOS os leads
// (WON/LOST acumulam sem fim) e serializava tudo em memória a cada abertura. As
// colunas mais recentes por stage cabem folgado; o drag-and-drop opera sobre elas.
const PER_STAGE_LIMIT = 200

export const GET = withRequestContext(
  { action: "admin.leads.list", route: "/api/admin/leads" },
  async (request: Request) => {
    const guard = await requireAdmin("leads.view")
    if (!guard.ok) return guard.response
    // Apenas SUPER_ADMIN e PMB_SALES (vendas diretas PMB) acessam os leads do PMB.
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

    const baseWhere = {
      tenantId: null, // PMB
      ...(courseId ? { courseId } : {}),
      ...(source ? { source: source as never } : {}),
    }

    // Uma query CAPADA por coluna (em paralelo) — teto de memória e payload por
    // stage, preservando a ordenação intra-coluna do drag-and-drop.
    const board = emptyBoard()
    await Promise.all(
      ALL_STAGES.map(async (stage) => {
        const leads = await prisma.studentLead.findMany({
          where: { ...baseWhere, stage },
          orderBy: [{ columnOrder: "asc" }, { createdAt: "desc" }],
          take: PER_STAGE_LIMIT,
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
        board[stage] = leads.map(serializeLead)
      }),
    )

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
