import { prisma } from "@/lib/prisma"
import { listPayments } from "./client"

export interface ReconcileResult {
  /** Pagamentos retornados pela conta Asaas (visão usada na conferência). */
  checked: number
  /** Linhas marcadas DELETED nesta passada. */
  markedDeleted: number
  /** true quando a lista do Asaas veio incompleta (hasMore) → não age. */
  skipped: boolean
}

/**
 * Reconcilia as mensalidades (TenantPayment) de um tenant contra a conta Asaas
 * global da PMB. Cobranças PENDING/OVERDUE/DELETING que NÃO existem mais na
 * conta (lista completa) já foram canceladas/removidas lá — tipicamente órfãs
 * de assinatura recriada por mudança de valor/vencimento, ou cancelamento que
 * não sincronizou. São marcadas DELETED.
 *
 * Seguro por construção: só age com visão completa (`!hasMore`) e nunca toca em
 * RECEIVED/CONFIRMED/REFUNDED. Cobranças ainda vivas no Asaas aparecem na lista
 * e são preservadas. Mesma regra da reconciliação inline do GET do detalhe.
 */
export async function reconcileTenantPayments(tenant: {
  id: string
  asaasCustomerId: string | null
  asaasSubscriptionId: string | null
}): Promise<ReconcileResult> {
  const filter = tenant.asaasCustomerId
    ? { customer: tenant.asaasCustomerId, limit: 100 }
    : tenant.asaasSubscriptionId
      ? { subscription: tenant.asaasSubscriptionId, limit: 100 }
      : null
  if (!filter) return { checked: 0, markedDeleted: 0, skipped: true }

  const asaas = await listPayments(filter)
  // Lista paginada (mais de 100 cobranças): não temos a visão completa, então
  // não dá para afirmar que uma ausente foi removida. Pula sem agir.
  if (asaas.hasMore) {
    return { checked: asaas.data.length, markedDeleted: 0, skipped: true }
  }

  const asaasIds = new Set(asaas.data.map((p) => p.id))
  const candidates = await prisma.tenantPayment.findMany({
    where: {
      tenantId: tenant.id,
      status: { in: ["PENDING", "OVERDUE", "DELETING"] },
    },
    select: { asaasPaymentId: true },
  })
  const staleIds = candidates
    .filter((p) => !asaasIds.has(p.asaasPaymentId))
    .map((p) => p.asaasPaymentId)

  if (staleIds.length > 0) {
    await prisma.tenantPayment.updateMany({
      where: { tenantId: tenant.id, asaasPaymentId: { in: staleIds } },
      data: { status: "DELETED" },
    })
  }

  return { checked: asaas.data.length, markedDeleted: staleIds.length, skipped: false }
}
