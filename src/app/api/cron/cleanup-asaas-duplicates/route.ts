import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { isCronAuthorized } from "@/lib/auth/bearer"
import {
  listSubscriptions,
  listPayments,
  cancelSubscription,
  deletePayment,
  AsaasApiError,
} from "@/lib/asaas/client"
import { contextLogger } from "@/lib/logger"

export const maxDuration = 300
export const dynamic = "force-dynamic"

interface TargetRow {
  slug: string
  execute: boolean
}

/**
 * Limpeza ESCOPADA de cobranças duplicadas no Asaas. Atua SOMENTE nas unidades
 * listadas em public._pmb_cleanup_targets (allowlist controlada via SQL), nunca
 * em toda a base. Por unidade, mantém só a assinatura canônica
 * (tenant.asaasSubscriptionId):
 *
 *   A. Cancela assinaturas ATIVAS não-canônicas (ex.: assinatura extra/teste).
 *   B. Apaga cobranças PENDING/OVERDUE cujo `subscription` NÃO é a canônica
 *      (links órfãos). Preserva a canônica e pagamentos avulsos (sem subscription).
 *
 * `execute=false` na linha do alvo => DRY-RUN (só registra o que faria). Isso
 * permite conferir o plano antes de mexer no dinheiro. Grava em _pmb_sub_cleanup.
 */
async function run() {
  const targets = await prisma.$queryRaw<TargetRow[]>`
    select slug, execute from public._pmb_cleanup_targets order by slug
  `

  const totals = {
    targets: targets.length,
    canceledSubs: 0,
    deletedPayments: 0,
    skipped: 0,
    errors: 0,
  }

  for (const target of targets) {
    const tenant = await prisma.tenant.findUnique({
      where: { slug: target.slug },
      select: { id: true, slug: true, asaasCustomerId: true, asaasSubscriptionId: true },
    })
    if (!tenant?.asaasCustomerId || !tenant.asaasSubscriptionId) {
      totals.skipped += 1
      continue
    }
    const canonical = tenant.asaasSubscriptionId
    const mode = target.execute ? "exec" : "dry"
    const cancelSubsList: string[] = []
    const deletePaymentsList: { id: string; value: number; dueDate: string; subscription: string | null }[] = []
    const errors: string[] = []

    try {
      const subs = await listSubscriptions({ customer: tenant.asaasCustomerId, limit: 100 })
      for (const s of subs.data) {
        if (s.status !== "ACTIVE" || s.id === canonical) continue
        if (target.execute) {
          try {
            await cancelSubscription(s.id)
          } catch (e) {
            if (!(e instanceof AsaasApiError && e.statusCode === 404)) {
              errors.push(`sub ${s.id}: ${e instanceof Error ? e.message : "erro"}`)
              continue
            }
          }
        }
        cancelSubsList.push(s.id)
      }

      const pays = await listPayments({ customer: tenant.asaasCustomerId, limit: 100 })
      for (const p of pays.data) {
        const pendingish = p.status === "PENDING" || p.status === "OVERDUE"
        const orphan = Boolean(p.subscription) && p.subscription !== canonical
        if (!pendingish || !orphan) continue
        if (target.execute) {
          try {
            await deletePayment(p.id)
          } catch (e) {
            if (!(e instanceof AsaasApiError && e.statusCode === 404)) {
              errors.push(`pay ${p.id}: ${e instanceof Error ? e.message : "erro"}`)
              continue
            }
          }
          await prisma.tenantPayment
            .updateMany({ where: { asaasPaymentId: p.id, tenantId: tenant.id }, data: { status: "DELETED" } })
            .catch(() => {})
        }
        deletePaymentsList.push({ id: p.id, value: p.value, dueDate: p.dueDate, subscription: p.subscription })
      }
    } catch (e) {
      errors.push(`fatal: ${e instanceof Error ? e.message : "erro"}`)
    }

    totals.canceledSubs += cancelSubsList.length
    totals.deletedPayments += deletePaymentsList.length
    totals.errors += errors.length

    await prisma.$executeRaw`
      insert into public._pmb_sub_cleanup (slug, canceled_subs, deleted_payments, errors)
      values (
        ${`[${mode}] ${tenant.slug}`},
        ${JSON.stringify(cancelSubsList)}::jsonb,
        ${JSON.stringify(deletePaymentsList)}::jsonb,
        ${JSON.stringify(errors)}::jsonb
      )
    `.catch(() => {})
  }

  return totals
}

export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }
  const result = await run()
  contextLogger().info(
    { event: "cron.cleanup_asaas_duplicates", ...result },
    "limpeza escopada de cobranças duplicadas concluída",
  )
  return NextResponse.json({ data: result })
}

export async function GET(request: Request) {
  return POST(request)
}
