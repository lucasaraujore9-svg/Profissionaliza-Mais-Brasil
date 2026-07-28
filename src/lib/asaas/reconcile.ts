import { prisma } from "@/lib/prisma"
import { listPayments } from "./client"

export interface ReconcileResult {
  /** Pagamentos retornados pela conta Asaas (visão usada na conferência). */
  checked: number
  /** Linhas marcadas DELETED nesta passada. */
  markedDeleted: number
  /** Cobranças espelhadas do Asaas (criadas ou atualizadas) nesta passada. */
  imported: number
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
 * Seguro por construção: a inferência de remoção só age com visão completa
 * (`!hasMore`) e nunca toca em RECEIVED/CONFIRMED/REFUNDED. Cobranças ainda
 * vivas no Asaas aparecem na lista e são preservadas. Mesma regra da
 * reconciliação inline do GET do detalhe.
 *
 * ESPELHAMENTO (importação): antes de inferir remoções, toda cobrança vista no
 * Asaas é espelhada em TenantPayment. Sem isso, uma cobrança que nunca gerou
 * webhook processável — `PAYMENT_CREATED` desligado no painel do Asaas, ou
 * cobrança avulsa sem `subscription`, que o processador não consegue casar com
 * o tenant — ficaria invisível no banco, e a unidade não veria o próprio boleto
 * em aberto. A importação não depende de `hasMore`: espelhar o que se vê é
 * sempre seguro; só a conclusão "sumiu, logo foi removida" exige visão total.
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
  if (!filter) return { checked: 0, markedDeleted: 0, imported: 0, skipped: true }

  const asaas = await listPayments(filter)

  // ── Espelhamento das cobranças vistas no Asaas ────────────────────────────
  // Sequencial de propósito: `$transaction([...])` em lote cai sobre o pooler
  // do Supabase (ver histórico do projeto) e este laço tem no máximo 100 itens.
  let imported = 0
  for (const p of asaas.data) {
    try {
      await prisma.tenantPayment.upsert({
        where: { asaasPaymentId: p.id },
        update: {
          status: p.status,
          amount: p.value,
          billingType: p.billingType,
          dueDate: new Date(p.dueDate),
          paidAt: p.paymentDate ? new Date(p.paymentDate) : null,
          ...(p.invoiceUrl ? { invoiceUrl: p.invoiceUrl } : {}),
          ...(p.bankSlipUrl ? { bankSlipUrl: p.bankSlipUrl } : {}),
        },
        create: {
          tenantId: tenant.id,
          asaasPaymentId: p.id,
          amount: p.value,
          billingType: p.billingType,
          status: p.status,
          dueDate: new Date(p.dueDate),
          paidAt: p.paymentDate ? new Date(p.paymentDate) : null,
          invoiceUrl: p.invoiceUrl ?? null,
          bankSlipUrl: p.bankSlipUrl ?? null,
        },
        select: { id: true },
      })
      imported++
    } catch {
      // Uma cobrança que não espelha não pode derrubar as outras nem a
      // inferência de remoção abaixo. O total em `imported` denuncia a falha.
    }
  }

  // Lista paginada (mais de 100 cobranças): não temos a visão completa, então
  // não dá para afirmar que uma ausente foi removida. Para sem inferir.
  if (asaas.hasMore) {
    return { checked: asaas.data.length, markedDeleted: 0, imported, skipped: true }
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

  return {
    checked: asaas.data.length,
    markedDeleted: staleIds.length,
    imported,
    skipped: false,
  }
}
