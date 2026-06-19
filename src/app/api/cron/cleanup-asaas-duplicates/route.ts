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
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"
import { contextLogger } from "@/lib/logger"

export const maxDuration = 300
export const dynamic = "force-dynamic"

/**
 * Limpeza de cobranças duplicadas no Asaas, por unidade. Mantém SOMENTE a
 * assinatura canônica (tenant.asaasSubscriptionId) e o ciclo dela. Ações:
 *
 *   A. Cancela assinaturas ATIVAS não-canônicas (ex.: assinatura extra/teste
 *      cobrando em paralelo). Asaas remove as cobranças pendentes dela.
 *   B. Apaga cobranças PENDING/OVERDUE cujo `subscription` NÃO é a canônica
 *      (links órfãos de assinaturas recriadas/canceladas). Cobranças da
 *      canônica são preservadas; pagamentos avulsos (sem subscription) também.
 *
 * Só roda para unidades COM assinatura canônica definida (evita zerar tenant
 * gratuito). Idempotente. Grava o que fez em public._pmb_sub_cleanup.
 */
async function run() {
  const tenants = await prisma.tenant.findMany({
    where: {
      slug: { not: PMB_TENANT_SLUG },
      asaasCustomerId: { not: null },
      asaasSubscriptionId: { not: null },
    },
    select: { id: true, slug: true, asaasCustomerId: true, asaasSubscriptionId: true },
  })

  const totals = { tenants: tenants.length, canceledSubs: 0, deletedPayments: 0, touched: 0, errors: 0 }

  for (const tenant of tenants) {
    const canonical = tenant.asaasSubscriptionId!
    const canceledSubs: string[] = []
    const deletedPayments: string[] = []
    const errors: string[] = []

    try {
      // A. Cancela assinaturas ativas que não são a canônica.
      const subs = await listSubscriptions({ customer: tenant.asaasCustomerId!, limit: 100 })
      for (const s of subs.data) {
        if (s.status !== "ACTIVE" || s.id === canonical) continue
        try {
          await cancelSubscription(s.id)
          canceledSubs.push(s.id)
        } catch (e) {
          if (!(e instanceof AsaasApiError && e.statusCode === 404)) {
            errors.push(`sub ${s.id}: ${e instanceof Error ? e.message : "erro"}`)
          }
        }
      }

      // B. Apaga cobranças pendentes/vencidas órfãs (subscription != canônica).
      const pays = await listPayments({ customer: tenant.asaasCustomerId!, limit: 100 })
      for (const p of pays.data) {
        const pendingish = p.status === "PENDING" || p.status === "OVERDUE"
        const orphan = Boolean(p.subscription) && p.subscription !== canonical
        if (!pendingish || !orphan) continue
        try {
          await deletePayment(p.id)
        } catch (e) {
          if (!(e instanceof AsaasApiError && e.statusCode === 404)) {
            errors.push(`pay ${p.id}: ${e instanceof Error ? e.message : "erro"}`)
            continue
          }
        }
        await prisma.tenantPayment
          .updateMany({
            where: { asaasPaymentId: p.id, tenantId: tenant.id },
            data: { status: "DELETED" },
          })
          .catch(() => {})
        deletedPayments.push(p.id)
      }
    } catch (e) {
      errors.push(`fatal: ${e instanceof Error ? e.message : "erro"}`)
    }

    totals.canceledSubs += canceledSubs.length
    totals.deletedPayments += deletedPayments.length
    totals.errors += errors.length

    if (canceledSubs.length || deletedPayments.length || errors.length) {
      totals.touched += 1
      await prisma.$executeRaw`
        insert into public._pmb_sub_cleanup (slug, canceled_subs, deleted_payments, errors)
        values (${tenant.slug}, ${JSON.stringify(canceledSubs)}::jsonb, ${JSON.stringify(deletedPayments)}::jsonb, ${JSON.stringify(errors)}::jsonb)
      `.catch(() => {})
    }
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
    "limpeza de cobranças duplicadas concluída",
  )
  return NextResponse.json({ data: result })
}

export async function GET(request: Request) {
  return POST(request)
}
