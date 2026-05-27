import { prisma } from "@/lib/prisma"
import { contextLogger } from "@/lib/logger"
import { queueLeadMessage } from "./dispatch"
import { resolveAutomationContext } from "./context"

const DEDUP_WINDOW_MS = 48 * 60 * 60 * 1000

interface UpsertLeadFromCheckoutArgs {
  // null = vitrine PMB (sistema mae)
  tenantId: string | null
  enrollmentId: string
  nome: string
  email: string | null
  telefone: string | null
  courseId: string
  courseSnapshot: string
}

/**
 * Chamado quando um Enrollment PENDING e criado (vitrine de revendedor OU
 * vitrine PMB). Procura StudentLead recente para linkar; senao, cria novo.
 */
export async function upsertLeadFromCheckout(
  args: UpsertLeadFromCheckoutArgs,
): Promise<void> {
  if (!args.email && !args.telefone) return

  const since = new Date(Date.now() - DEDUP_WINDOW_MS)
  const existing = await prisma.studentLead.findFirst({
    where: {
      tenantId: args.tenantId,
      courseId: args.courseId,
      createdAt: { gte: since },
      OR: [
        ...(args.email ? [{ email: args.email }] : []),
        ...(args.telefone ? [{ telefone: normalizeE164(args.telefone) }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, stage: true, enrollmentId: true },
  })

  if (existing) {
    if (existing.enrollmentId && existing.enrollmentId !== args.enrollmentId) {
      await createNewLead(args)
      return
    }
    await prisma.$transaction([
      prisma.studentLead.update({
        where: { id: existing.id },
        data: {
          enrollmentId: args.enrollmentId,
          stage: "CHECKOUT_STARTED",
        },
      }),
      prisma.studentLeadActivity.create({
        data: {
          leadId: existing.id,
          kind: "ENROLLMENT_LINKED",
          metadata: {
            enrollmentId: args.enrollmentId,
            fromStage: existing.stage,
            toStage: "CHECKOUT_STARTED",
          },
        },
      }),
    ])
    return
  }

  await createNewLead(args)
}

async function createNewLead(args: UpsertLeadFromCheckoutArgs): Promise<void> {
  const telefone = args.telefone
    ? normalizeE164(args.telefone)
    : "+5500000000000"

  await prisma.studentLead.create({
    data: {
      tenantId: args.tenantId,
      nome: args.nome,
      email: args.email ?? `sem-email-${args.enrollmentId}@noemail.local`,
      telefone,
      courseId: args.courseId,
      courseSnapshot: args.courseSnapshot,
      enrollmentId: args.enrollmentId,
      stage: "CHECKOUT_STARTED",
      source: "CHECKOUT_ABANDON",
      activities: {
        create: {
          kind: "LEAD_CREATED",
          metadata: { source: "CHECKOUT_ABANDON", enrollmentId: args.enrollmentId },
        },
      },
    },
  })
}

interface MarkLeadAsWonArgs {
  enrollmentId: string
  // Quando vier do webhook de revendedor, eh o tenantId esperado.
  // Quando vier do webhook PMB, eh null (e o lead vinculado tambem
  // precisa ter tenantId=null).
  tenantId: string | null
  amount: number
}

export async function markLeadAsWon(args: MarkLeadAsWonArgs): Promise<void> {
  const lead = await prisma.studentLead.findUnique({
    where: { enrollmentId: args.enrollmentId },
    select: { id: true, stage: true, tenantId: true },
  })

  if (!lead) return
  if (lead.tenantId !== args.tenantId) {
    contextLogger().warn(
      {
        event: "automation.leads.tenant_mismatch",
        leadId: lead.id,
        leadTenant: lead.tenantId,
        callerTenant: args.tenantId,
      },
      "Tenant do lead nao bate com o do caller",
    )
    return
  }
  if (lead.stage === "WON") return

  await prisma.$transaction([
    prisma.studentLead.update({
      where: { id: lead.id },
      data: {
        stage: "WON",
        paymentValue: args.amount,
      },
    }),
    prisma.studentLeadActivity.create({
      data: {
        leadId: lead.id,
        kind: "PAYMENT_APPROVED",
        metadata: {
          enrollmentId: args.enrollmentId,
          amount: args.amount,
          fromStage: lead.stage,
          toStage: "WON",
        },
      },
    }),
  ])

  await queueLeadMessage({
    leadId: lead.id,
    templateKey: "PURCHASE_CONFIRMED",
  }).catch((err) => {
    contextLogger().error(
      { err, event: "automation.leads.purchase_dispatch_failed", leadId: lead.id },
      "Falha ao enfileirar mensagem PURCHASE_CONFIRMED",
    )
  })
}

interface SweepResult {
  swept: number
}

/**
 * Move para ABANDONED os leads CHECKOUT_STARTED do contexto (tenant ou PMB)
 * que passaram da janela sem pagamento aprovado.
 */
export async function sweepAbandonedLeadsForContext(
  tenantId: string | null,
  hours: number,
): Promise<SweepResult> {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000)

  const candidates = await prisma.studentLead.findMany({
    where: {
      tenantId,
      stage: "CHECKOUT_STARTED",
      createdAt: { lte: cutoff },
      enrollment: {
        is: {
          status: { not: "ACTIVE" },
          payments: { none: { mpStatus: "APPROVED" } },
        },
      },
    },
    select: { id: true },
  })

  if (candidates.length === 0) return { swept: 0 }

  let swept = 0
  for (const lead of candidates) {
    await prisma.$transaction([
      prisma.studentLead.update({
        where: { id: lead.id },
        data: { stage: "ABANDONED" },
      }),
      prisma.studentLeadActivity.create({
        data: {
          leadId: lead.id,
          kind: "STAGE_CHANGED",
          metadata: {
            fromStage: "CHECKOUT_STARTED",
            toStage: "ABANDONED",
            reason: "cron_sweep",
          },
        },
      }),
    ])

    queueLeadMessage({
      leadId: lead.id,
      templateKey: "CHECKOUT_ABANDONED",
    }).catch((err) => {
      contextLogger().error(
        { err, event: "automation.leads.abandon_dispatch_failed", leadId: lead.id },
        "Falha ao enfileirar mensagem CHECKOUT_ABANDONED",
      )
    })

    swept++
  }

  return { swept }
}

// Backward-compat: nome antigo, redireciona para a versao generica.
export async function sweepAbandonedLeadsForTenant(
  tenantId: string,
  hours: number,
): Promise<SweepResult> {
  return sweepAbandonedLeadsForContext(tenantId, hours)
}

function normalizeE164(value: string): string {
  const digits = value.replace(/\D/g, "")
  if (!digits) return value
  if (digits.startsWith("55") && digits.length >= 12) return `+${digits}`
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`
  return `+${digits}`
}

// Re-export do resolveAutomationContext para conveniencia
export { resolveAutomationContext } from "./context"
