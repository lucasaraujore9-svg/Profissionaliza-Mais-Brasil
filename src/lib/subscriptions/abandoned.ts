import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { cancelSubscriptionAccess } from "./cancel"

/**
 * Assinatura PENDENTE que ninguem pagou.
 *
 * Antes cada checkout APAGAVA a pendente anterior do aluno (`deleteMany`) sem
 * olhar o gateway. Tres estragos: a recorrencia no Asaas/MP ficava viva e o
 * pagamento que chegasse depois caia em "assinatura nao encontrada" (dinheiro
 * sem acesso); a VENDA DIRETA do vendedor sumia, levando o link ja enviado; e a
 * pendente com cobranca registrada nunca saia, travando toda venda direta nova
 * para o aluno ("aguarde o pagamento ou cancele a anterior", sem ter onde
 * cancelar).
 *
 * Regra agora: so se APAGA a linha que nunca chegou ao gateway
 * (`externalReference` e gravado por todo caminho de cobranca). A que chegou e
 * CANCELADA pelo nucleo, que encerra a recorrencia na conta certa antes.
 */

/** Nenhum ciclo pago: a pendente nunca deu acesso a nada. */
const NEVER_PAID: Prisma.StudentSubscriptionWhereInput = {
  status: "PENDING",
  // Carne tem varredura propria (`carne-sweep`), que conhece os boletos.
  boletoCarne: false,
  payments: { none: { paidAt: { not: null } } },
}

/** Prazo para a pendente de venda direta/checkout ser encerrada pela varredura. */
export const STALE_PENDING_DAYS = 7

async function discard(rows: { id: string; externalReference: string | null }[]) {
  const neverCharged = rows.filter((r) => !r.externalReference).map((r) => r.id)
  if (neverCharged.length > 0) {
    await prisma.studentSubscription.deleteMany({
      where: { id: { in: neverCharged }, ...NEVER_PAID, externalReference: null },
    })
  }
  let cancelled = 0
  for (const r of rows.filter((r) => r.externalReference)) {
    await cancelSubscriptionAccess(r.id, "REQUESTED", false)
    cancelled += 1
  }
  return { deleted: neverCharged.length, cancelled }
}

/**
 * Checkout da VITRINE largado pelo aluno, antes de ele abrir outro. Nunca toca
 * na venda direta (`soldByUserId`): aquela tem link enviado e quem encerra e a
 * varredura, pelo prazo de `STALE_PENDING_DAYS`.
 */
export async function discardAbandonedCheckouts(
  studentId: string,
  tenantId: string | null,
  olderThan: Date,
) {
  const rows = await prisma.studentSubscription.findMany({
    where: {
      studentId,
      tenantId,
      soldByUserId: null,
      createdAt: { lt: olderThan },
      ...NEVER_PAID,
    },
    select: { id: true, externalReference: true },
  })
  return discard(rows)
}

/** Varredura diaria: pendente sem pagamento ha mais de `STALE_PENDING_DAYS`. */
export async function expireStalePendingSubscriptions(now: Date) {
  const cutoff = new Date(now.getTime() - STALE_PENDING_DAYS * 24 * 60 * 60 * 1000)
  const rows = await prisma.studentSubscription.findMany({
    where: { createdAt: { lt: cutoff }, ...NEVER_PAID },
    select: { id: true, externalReference: true },
    take: 200,
  })
  // Aqui nada e apagado: a linha fica CANCELADA como historico da venda.
  let cancelled = 0
  const errors: string[] = []
  for (const r of rows) {
    try {
      await cancelSubscriptionAccess(r.id, "REQUESTED", false)
      cancelled += 1
    } catch (err) {
      errors.push(`subscription ${r.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return { cancelled, errors }
}
