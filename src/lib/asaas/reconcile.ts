import { prisma } from "@/lib/prisma"
import { MANUAL_PAYMENT_PREFIX } from "@/lib/tenant-billing/manual-payment"
import {
  competenciaPagamento,
  dataPagamentoCliente,
} from "@/lib/asaas/competencia"
import { listPayments } from "./client"
import { isPixRecebidoSemCobranca } from "./charge-status"
import { emitUnidadePagamento } from "@/lib/webhooks-saida/unidade"
import { appendNote, outsideChanges } from "@/lib/tenant-billing/change-log"
import type { AsaasPayment } from "./types"

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

  const { imported } = await mirrorAsaasPayments(tenant.id, asaas.data, "cron")

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
      // Baixa manual nao existe no Asaas: "nao apareceu na lista" e o esperado,
      // nao prova de cancelamento. Hoje ela nasce paga e ja escaparia pelo
      // filtro de status — a exclusao aqui e para o dia em que alguem
      // acrescentar um status a lista acima e apagar dado que ninguem esperava.
      NOT: { asaasPaymentId: { startsWith: MANUAL_PAYMENT_PREFIX } },
    },
    select: { id: true, status: true, notes: true, asaasPaymentId: true },
  })
  const stale = candidates.filter((p) => !asaasIds.has(p.asaasPaymentId))
  await markRemovedInAsaas(stale)

  return {
    checked: asaas.data.length,
    markedDeleted: stale.length,
    imported,
    skipped: false,
  }
}

/** Linha do banco que espelha uma cobranca do Asaas. `locked` = baixa manual ou
 * estorno registrado no PMB: vale o banco, nao o status do Asaas. */
export type MirroredRow = { id: string; notes: string | null; locked: boolean }

const PAID = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"])

/**
 * Espelha no banco as cobrancas que o Asaas listou para a unidade e devolve o
 * id LOCAL de cada uma — a tela age sempre sobre a linha do banco.
 *
 * Tres regras que o upsert antigo nao tinha:
 * - Fatura com BAIXA MANUAL ou ESTORNO registrado no PMB nao e reescrita pelo
 *   status do Asaas. Se o cancelamento no Asaas falhou apos a baixa, ele ainda
 *   lista a cobranca em aberto, e regravar o status desfaria a baixa.
 * - Mudanca feita direto no Asaas (baixa em dinheiro, valor, vencimento) vira
 *   uma linha no historico (`notes`), em vez de sobrescrever calada.
 * - Cobranca cujo espelho e de OUTRA unidade nao e tocada.
 */
export async function mirrorAsaasPayments(
  tenantId: string,
  payments: AsaasPayment[],
  origin: "cron" | "admin",
): Promise<{ imported: number; rows: Map<string, MirroredRow> }> {
  const rows = new Map<string, MirroredRow>()
  const visible = payments.filter((p) => !isPixRecebidoSemCobranca(p))
  if (visible.length === 0) return { imported: 0, rows }

  const existing = await prisma.tenantPayment.findMany({
    where: { asaasPaymentId: { in: visible.map((p) => p.id) } },
    select: {
      id: true,
      tenantId: true,
      asaasPaymentId: true,
      status: true,
      amount: true,
      billingType: true,
      dueDate: true,
      paidAt: true,
      markedPaidAt: true,
      refundedAt: true,
      notes: true,
    },
  })
  const byAsaas = new Map(existing.map((e) => [e.asaasPaymentId, e]))

  // Sequencial de propósito: `$transaction([...])` em lote cai sobre o pooler
  // do Supabase (ver histórico do projeto) e este laço tem no máximo 100 itens.
  let imported = 0
  for (const p of visible) {
    const prev = byAsaas.get(p.id)
    if (prev && prev.tenantId !== tenantId) continue
    if (prev && (prev.markedPaidAt || prev.refundedAt)) {
      rows.set(p.id, { id: prev.id, notes: prev.notes, locked: true })
      continue
    }

    const paidAt = p.paymentDate ? new Date(p.paymentDate) : null
    const changes = prev
      ? outsideChanges(
          { status: prev.status, amount: Number(prev.amount), dueDate: prev.dueDate },
          { status: p.status, value: p.value, dueDate: p.dueDate },
        )
      : []
    const unchanged =
      prev &&
      changes.length === 0 &&
      prev.status === p.status &&
      prev.billingType === p.billingType &&
      prev.dueDate.toISOString().slice(0, 10) === p.dueDate &&
      (prev.paidAt?.getTime() ?? null) === (paidAt?.getTime() ?? null)
    if (unchanged) {
      rows.set(p.id, { id: prev.id, notes: prev.notes, locked: false })
      continue
    }

    const notes = changes.reduce<string | null>((acc, line) => appendNote(acc, line), prev?.notes ?? null)
    try {
      const saved = await prisma.tenantPayment.upsert({
        where: { asaasPaymentId: p.id },
        update: {
          status: p.status,
          amount: p.value,
          billingType: p.billingType,
          dueDate: new Date(p.dueDate),
          paidAt,
          // Caixa (credito) x fato (cliente) x regra (mes) — ./competencia.ts.
          clientPaidAt: dataPagamentoCliente(p),
          competenceAt: competenciaPagamento(p),
          ...(changes.length > 0 ? { notes } : {}),
          ...(p.invoiceUrl ? { invoiceUrl: p.invoiceUrl } : {}),
          ...(p.bankSlipUrl ? { bankSlipUrl: p.bankSlipUrl } : {}),
        },
        create: {
          tenantId,
          asaasPaymentId: p.id,
          amount: p.value,
          billingType: p.billingType,
          status: p.status,
          dueDate: new Date(p.dueDate),
          paidAt,
          clientPaidAt: dataPagamentoCliente(p),
          competenceAt: competenciaPagamento(p),
          invoiceUrl: p.invoiceUrl ?? null,
          bankSlipUrl: p.bankSlipUrl ?? null,
        },
        select: { id: true, notes: true },
      })
      rows.set(p.id, { ...saved, locked: false })
      imported++
      // Webhook perdido: o espelho e quem descobre o pagamento. Se o webhook
      // ja tinha avisado, o dedupe por cobrança descarta este.
      if (PAID.has(p.status) && prev?.status !== p.status) {
        await emitUnidadePagamento("unidade.pagamento.confirmado", p.id, origin)
      }
    } catch {
      // Uma cobrança que não espelha não pode derrubar as outras nem a
      // inferência de remoção. O total em `imported` denuncia a falha.
    }
  }
  return { imported, rows }
}

/**
 * Faturas que sumiram da lista COMPLETA do Asaas: marca DELETED, nunca apaga a
 * linha. Quem estava em DELETING foi cancelado pelo PMB (o botao ja anotou); o
 * resto foi cancelado direto no Asaas e ganha a nota. Devolve as notas novas.
 */
export async function markRemovedInAsaas(
  stale: { id: string; status: string; notes: string | null }[],
): Promise<Map<string, string | null>> {
  const notesById = new Map<string, string | null>()
  for (const row of stale) {
    const notes =
      row.status === "DELETING" ? row.notes : appendNote(row.notes, "Cancelada direto no Asaas.")
    await prisma.tenantPayment.update({
      where: { id: row.id },
      data: { status: "DELETED", notes },
    })
    notesById.set(row.id, notes)
  }
  return notesById
}
