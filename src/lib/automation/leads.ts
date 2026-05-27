import { prisma } from "@/lib/prisma"
import { contextLogger } from "@/lib/logger"
import { queueLeadMessage } from "./dispatch"

const DEDUP_WINDOW_MS = 48 * 60 * 60 * 1000

interface UpsertLeadFromCheckoutArgs {
  tenantId: string
  enrollmentId: string
  nome: string
  email: string | null
  telefone: string | null
  courseId: string
  courseSnapshot: string
}

/**
 * Chamado quando um Enrollment PENDING e criado via /api/loja/checkout.
 * Procura um StudentLead recente que possa ser linkado; senao, cria novo
 * com source=CHECKOUT_ABANDON e stage=CHECKOUT_STARTED.
 *
 * Importante: NAO dispara WhatsApp aqui. O lead so vai disparar:
 *   - PURCHASE_CONFIRMED quando pagar (markLeadAsWon via webhook MP)
 *   - CHECKOUT_ABANDONED quando o cron mover pra ABANDONED
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
      // Lead ja tem enrollment vinculado diferente — cria novo para nao
      // sobrescrever o vinculo anterior.
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
  tenantId: string | null
  amount: number
}

/**
 * Chamado pelo webhook MP em fulfillFromMp apos fulfillEnrollment confirmar
 * o pagamento. Procura o StudentLead vinculado a essa enrollment e move
 * para WON. Dispara mensagem de confirmacao via WhatsApp.
 *
 * E silencioso para enrollments sem lead (ex: vendas diretas /admin, /aluno).
 */
export async function markLeadAsWon(args: MarkLeadAsWonArgs): Promise<void> {
  const lead = await prisma.studentLead.findUnique({
    where: { enrollmentId: args.enrollmentId },
    select: { id: true, stage: true, tenantId: true },
  })

  if (!lead) return
  if (args.tenantId && lead.tenantId !== args.tenantId) {
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
 * Move para ABANDONED os leads CHECKOUT_STARTED que passaram do janela
 * configurada por tenant sem pagamento aprovado. Usado pelo cron.
 */
export async function sweepAbandonedLeadsForTenant(
  tenantId: string,
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

function normalizeE164(value: string): string {
  const digits = value.replace(/\D/g, "")
  if (!digits) return value
  if (digits.startsWith("55") && digits.length >= 12) return `+${digits}`
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`
  return `+${digits}`
}
