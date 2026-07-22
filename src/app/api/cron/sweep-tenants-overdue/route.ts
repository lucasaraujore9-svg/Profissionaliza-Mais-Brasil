import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { blockTenantStudents } from "@/lib/auto-block"
import { sendEmail } from "@/lib/email/resend"
import { createNotification } from "@/lib/notifications"
import { authorizeCron } from "@/lib/observability/cron-heartbeat"
import { invalidateTenantCache } from "@/lib/tenant/cache-invalidation"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"

export const maxDuration = 300
export const dynamic = "force-dynamic"

// Pequeno throttle entre emails para não estourar o rate limit do Resend
// (dev: 10 req/s, prod típico: 14k req/dia). 120ms = ~8 req/s.
const EMAIL_THROTTLE_MS = 120
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface CancellationPolicy {
  gracePeriodDays?: number
  keepStudentsActive?: boolean
  notifyStudents?: boolean
}

const DEFAULT_GRACE_DAYS = 3

/**
 * Sweep periodico para cobrir falhas de webhook do Asaas.
 *
 * Procura tenants com mensalidade vencida ha mais de gracePeriodDays e
 * que ainda estao ACTIVE. Marca como SUSPENDED. Se billingMode=AUTO,
 * dispara blockTenantStudents (mesmo caminho do webhook PAYMENT_OVERDUE).
 *
 * E idempotente: roda quantas vezes quiser, so atua em quem nao foi
 * processado antes.
 */
async function processOverdueTenants() {
  const log = contextLogger()
  const now = new Date()
  const result = {
    inspected: 0,
    suspended: 0,
    studentsBlocked: 0,
    errors: [] as string[],
  }

  // Tenants com pagamento OVERDUE e ainda ACTIVE
  const candidates = await prisma.tenant.findMany({
    where: {
      status: "ACTIVE",
      slug: { not: PMB_TENANT_SLUG },
      tenantPayments: {
        some: { status: "OVERDUE" },
      },
    },
    include: {
      tenantPayments: {
        where: { status: "OVERDUE" },
        orderBy: { dueDate: "asc" },
        take: 1,
      },
      owner: { select: { email: true, name: true } },
    },
  })

  result.inspected = candidates.length
  log.info({ event: "sweep_tenants.start", candidates: candidates.length }, "iniciando sweep de tenants overdue")

  for (const tenant of candidates) {
    const overdue = tenant.tenantPayments[0]
    if (!overdue) continue

    const policy = (tenant.cancellationPolicy as CancellationPolicy | null) ?? null
    const grace = policy?.gracePeriodDays ?? DEFAULT_GRACE_DAYS
    const dueAt = overdue.dueDate.getTime()
    const ageDays = Math.floor((now.getTime() - dueAt) / (1000 * 60 * 60 * 24))

    if (ageDays < grace) continue

    try {
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { status: "SUSPENDED" },
      })
      // PERF-001: invalida o cache p/ a vitrine refletir o bloqueio na hora.
      await invalidateTenantCache(tenant.id)
      result.suspended += 1
      log.warn(
        { event: "sweep_tenants.suspended", tenantId: tenant.id, ageDays, billingMode: tenant.billingMode },
        "tenant suspenso por inadimplência",
      )

      if (tenant.billingMode === "AUTO" && !policy?.keepStudentsActive) {
        const block = await blockTenantStudents(tenant.id)
        result.studentsBlocked += block.affectedStudents
        if (block.errors.length > 0) {
          result.errors.push(
            `tenant ${tenant.id}: ${block.errors.length} erro(s) bloqueando alunos`,
          )
        }
      }

      if (tenant.owner?.email) {
        await sendEmail({
          to: tenant.owner.email,
          subject: "Sua mensalidade está vencida",
          template: {
            type: "payment",
            props: {
              customerName: tenant.owner.name ?? tenant.name,
              amount: Number(overdue.amount).toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              }),
              paymentDate: overdue.dueDate.toLocaleDateString("pt-BR"),
              description:
                tenant.billingMode === "AUTO"
                  ? "Sua mensalidade venceu. Para evitar perda de receita, seus alunos foram bloqueados temporariamente até a regularização."
                  : "Sua mensalidade venceu. Regularize agora para manter a vitrine ativa e evitar o bloqueio dos seus alunos.",
              variant: "overdue",
            },
          },
        }).catch((err) => {
          log.error(
            { err, event: "sweep_tenants.email_failed", tenantId: tenant.id },
            "sweep-tenants: envio de email falhou",
          )
        })
        await sleep(EMAIL_THROTTLE_MS)
      }

      await createNotification({
        audience: "TENANT",
        tenantId: tenant.id,
        level: "ERROR",
        title: "Conta suspensa por inadimplência",
        body:
          tenant.billingMode === "AUTO"
            ? "Mensalidade vencida. Seus alunos foram bloqueados."
            : "Mensalidade vencida. Regularize para evitar bloqueios.",
        category: "tenant-billing",
        href: "/painel/financeiro",
      })
      await createNotification({
        audience: "ROLE",
        roleTarget: "SUPER_ADMIN",
        level: "WARNING",
        title: `Sweep: revendedor ${tenant.name} suspenso`,
        body: `Mensalidade vencida há ${ageDays} dia(s).`,
        category: "tenant-billing",
        href: `/admin/revendedores/${tenant.id}`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "erro desconhecido"
      result.errors.push(`tenant ${tenant.id}: ${message}`)
      log.error(
        { err: error, event: "sweep_tenants.tenant_failed", tenantId: tenant.id },
        "sweep-tenants: falha no processamento do tenant",
      )
    }
  }

  log.info(
    {
      event: "sweep_tenants.done",
      inspected: result.inspected,
      suspended: result.suspended,
      studentsBlocked: result.studentsBlocked,
      errorCount: result.errors.length,
    },
    "sweep de tenants concluído",
  )

  return result
}

export const POST = withRequestContext(
  { action: "cron.sweep_tenants_overdue", route: "/api/cron/sweep-tenants-overdue" },
  async (request: Request) => {
    if (!(await authorizeCron(request))) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }
    const result = await processOverdueTenants()
    return NextResponse.json({ data: result })
  },
)

export async function GET(request: Request) {
  return POST(request)
}
