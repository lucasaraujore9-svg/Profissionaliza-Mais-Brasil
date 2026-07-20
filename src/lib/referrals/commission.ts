/**
 * Ledger LEGADO de comissao de indicacao (uma linha por mensalidade paga).
 *
 * O motor que criava essas linhas foi APOSENTADO na unificacao: hoje existe um
 * unico motor, o fechamento mensal em ./monthly.ts. Este arquivo permanece
 * porque o ledger legado continua existindo como historico e ainda precisa de:
 *   - estorno/clawback das linhas antigas (refund total e parcial);
 *   - soma nos totais do painel (`summaryForTenant`);
 *   - `computeAvailableAt`, que os dois motores sempre compartilharam.
 *
 * `createCommissionForTenantPayment` e `backfillReferrerCommissions` viraram
 * no-op logado: os chamadores (webhook Asaas, pagamento por cartao, payout)
 * seguem intactos, mas nenhuma linha nova nasce aqui.
 */
import type { ReferralCommission } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { createNotification } from "@/lib/notifications"
import { contextLogger } from "@/lib/logger"
import { swallow } from "@/lib/errors"
import { CLAWBACK_MARKER_PREFIX, isClawbackMarked } from "@/lib/referrals/clawback"

const DEFAULT_PAYOUT_DAY = 20

/**
 * Calcula a data em que a comissao fica disponivel para saque.
 * Regra: dia X (SystemSettings.referralPayoutDay, default 20) do mes seguinte ao paidAt.
 *
 * Exemplos (payoutDay=20):
 *   2026-02-15 → 2026-03-20
 *   2026-02-28 → 2026-03-20
 *   2026-03-01 → 2026-04-20
 *
 * Edge case: payoutDay=31 e mes alvo com 30 dias → setUTCDate(31) overflow
 * para 01 do mes seguinte. Clampamos para o último dia do mês alvo.
 */
export function computeAvailableAt(paidAt: Date, payoutDay = DEFAULT_PAYOUT_DAY): Date {
  const d = new Date(paidAt)
  d.setUTCDate(1) // evita overflow durante o setMonth (31/jan + 1 mes != 3/mar)
  d.setUTCMonth(d.getUTCMonth() + 1)
  const lastDayOfTargetMonth = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate()
  d.setUTCDate(Math.min(payoutDay, lastDayOfTargetMonth))
  d.setUTCHours(0, 0, 0, 0)
  return d
}

const LEGACY_NOOP_EVENT = "referrals.legacy_engine_noop"

/**
 * APOSENTADA. O motor por pagamento foi substituido pelo fechamento mensal
 * (`computeMonthlyCommissions` em ./monthly.ts), que apura TODOS os indicadores.
 *
 * Mantida como no-op para nao mexer nos chamadores (webhook Asaas em
 * src/lib/asaas/process.ts e pagamento por cartao em
 * src/app/api/cobranca/[paymentId]/pay-card/route.ts) e para que qualquer
 * chamada residual apareca no log em vez de criar uma linha fantasma no ledger
 * legado — que hoje o motor mensal trataria como "mensalidade ja comissionada"
 * e excluiria da apuracao, causando comissao a menos.
 */
export async function createCommissionForTenantPayment(
  tenantPaymentId: string,
): Promise<ReferralCommission | null> {
  contextLogger().info(
    { event: LEGACY_NOOP_EVENT, fn: "createCommissionForTenantPayment", tenantPaymentId },
    "motor legado aposentado — comissao sera apurada no fechamento mensal",
  )
  return null
}

/** APOSENTADA junto com o motor legado. Ver `createCommissionForTenantPayment`. */
export async function backfillReferrerCommissions(
  referrerTenantId: string,
): Promise<number> {
  contextLogger().info(
    { event: LEGACY_NOOP_EVENT, fn: "backfillReferrerCommissions", referrerTenantId },
    "motor legado aposentado — comissao sera apurada no fechamento mensal",
  )
  return 0
}

/**
 * Cancela a comissao referente a uma TenantPayment estornada.
 *
 * Comportamento por estado atual da comissao:
 *  - PENDING ou AVAILABLE: marca CANCELLED com motivo.
 *  - PAID: NAO REVERTE o pagamento ja feito (dinheiro ja saiu).
 *    Notifica SUPER_ADMIN para resolucao manual.
 *    TODO: implementar saldo negativo via row espelhada com amount<0
 *    abatendo proximas comissoes. Hoje, registro manual.
 *  - CANCELLED: no-op.
 */
export async function cancelCommissionForTenantPayment(
  tenantPaymentId: string,
  reason: string,
): Promise<ReferralCommission | null> {
  const commission = await prisma.referralCommission.findUnique({
    where: { tenantPaymentId },
    include: {
      referrer: { select: { id: true, name: true } },
      referred: { select: { id: true, name: true } },
    },
  })
  if (!commission) return null

  if (commission.status === "CANCELLED") return commission

  if (commission.status === "PAID") {
    // Marca explicitamente a comissão como "estornada após pago" preservando
    // o registro PAID original (para o demonstrativo permanecer correto).
    // Esse marcador é lido em processMonthlyPayouts para BLOQUEAR a criação
    // de novos payouts automáticos para este referrer até que o débito seja
    // resolvido manualmente pelo admin (clawback).
    const clawbackMarker = `[CLAWBACK_PENDING] valor R$ ${Number(commission.amount).toFixed(2).replace(".", ",")} — motivo: ${reason}`
    const updated = await prisma.referralCommission.update({
      where: { id: commission.id },
      data: {
        // status fica PAID (histórico preservado), mas registramos no
        // cancelReason o pendente para auditoria.
        cancelReason: clawbackMarker,
        cancelledAt: new Date(),
      },
    })

    contextLogger().error(
      {
        event: "audit.referrals.clawback_pending",
        commissionId: commission.id,
        referrerTenantId: commission.referrerTenantId,
        amount: Number(commission.amount),
        reason,
      },
      "comissão PAID precisa de clawback — admin deve resolver manualmente",
    )

    await createNotification({
      audience: "ROLE",
      roleTarget: "SUPER_ADMIN",
      level: "ERROR",
      title: `⚠️ Clawback pendente: ${commission.referrer.name}`,
      body: `A comissão ${commission.id} (R$ ${Number(commission.amount).toFixed(2).replace(".", ",")}) já havia sido paga, mas a mensalidade ${commission.referred.name} foi estornada. Próximos payouts automáticos do indicador ficam BLOQUEADOS até resolver. Verifique /admin/indicacoes/comissoes.`,
      category: "referral",
      href: `/admin/indicacoes/comissoes`,
    })
    return updated
  }

  const updated = await prisma.referralCommission.update({
    where: { id: commission.id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelReason: reason,
    },
  })

  await createNotification({
    audience: "TENANT",
    tenantId: commission.referrerTenantId,
    level: "WARNING",
    title: "Comissao cancelada",
    body: `A comissao referente a ${commission.referred.name} foi cancelada (${reason}).`,
    category: "referral",
    href: "/painel/indicacoes",
  })

  return updated
}

/**
 * SAAS-005 — refund PARCIAL de uma mensalidade.
 *
 * Diferente do refund total (cancelCommissionForTenantPayment), aqui NÃO
 * cancelamos nem revertemos a comissão (evita over-clawback num estorno
 * pequeno — ex.: R$10 numa fatura de R$200): a decisão do valor proporcional é
 * do admin. Mas FREEZAMOS o saque: marcamos a comissão (qualquer status ativo:
 * PENDING/AVAILABLE/PAID) com `[CLAWBACK_PENDING]`, que os gates de saque
 * (requestPayout + processMonthlyPayouts) honram para BLOQUEAR novos payouts do
 * indicador até o financeiro resolver. Sem isto, o indicador poderia sacar a
 * comissão integral sobre uma mensalidade parcialmente estornada.
 *
 * Idempotente: não re-marca uma linha já marcada. No-op se a comissão não
 * existe ou já está CANCELLED.
 */
export async function freezeCommissionForPartialRefund(
  tenantPaymentId: string,
  reason: string,
): Promise<ReferralCommission | null> {
  const commission = await prisma.referralCommission.findUnique({
    where: { tenantPaymentId },
    include: {
      referrer: { select: { id: true, name: true } },
      referred: { select: { id: true, name: true } },
    },
  })
  if (!commission) return null
  if (commission.status === "CANCELLED") return commission
  if (isClawbackMarked(commission.cancelReason)) {
    return commission // já congelada
  }

  const valorFmt = Number(commission.amount).toFixed(2).replace(".", ",")
  const marker = `${CLAWBACK_MARKER_PREFIX} refund parcial — comissão R$ ${valorFmt} sob revisão — motivo: ${reason}`
  const updated = await prisma.referralCommission.update({
    where: { id: commission.id },
    data: {
      // status preservado (não cancela/reverte) — só congela o saque.
      cancelReason: marker,
      cancelledAt: new Date(),
    },
  })

  contextLogger().error(
    {
      event: "audit.referrals.partial_refund_freeze",
      commissionId: commission.id,
      referrerTenantId: commission.referrerTenantId,
      referredTenantId: commission.referredTenantId,
      amount: Number(commission.amount),
      status: commission.status,
      reason,
    },
    "refund parcial congelou comissão de indicação — saques bloqueados até revisão manual",
  )

  await createNotification({
    audience: "ROLE",
    roleTarget: "SUPER_ADMIN",
    level: "WARNING",
    title: `⚠️ Refund parcial: revise a comissão de ${commission.referrer.name}`,
    body: `A mensalidade de ${commission.referred.name} foi estornada parcialmente. A comissão ${commission.id} (R$ ${valorFmt}, ${commission.status}) ficou CONGELADA e os saques do indicador estão BLOQUEADOS até o ajuste manual. Resolva em /admin/indicacoes/comissoes.`,
    category: "referral",
    href: "/admin/indicacoes/comissoes",
  }).catch(swallow("referral.commission.partial_refund_notify"))

  return updated
}

export interface ReferralSummary {
  pending: number
  available: number
  paid: number
  cancelled: number
  /** Total de unidades indicadas (qualquer status). */
  totalReferrals: number
  /** Unidades indicadas ATIVAS — é esta a métrica exibida como "indicados ativos". */
  activeReferrals: number
  totalGenerated: number
}

/**
 * Retorna totais por tenant (referrer): pendente / disponivel / pago / cancelado.
 */
export async function summaryForTenant(referrerTenantId: string): Promise<ReferralSummary> {
  // Soma os DOIS motores: por pagamento (ReferralCommission) + por faixas
  // (ReferralMonthlyCommission). Os tiles do painel refletem o total real.
  const [
    grouped,
    monthlyGrouped,
    referralsCount,
    activeReferralsCount,
    totalGenerated,
    monthlyTotalGenerated,
  ] = await Promise.all([
    prisma.referralCommission.groupBy({
      by: ["status"],
      where: { referrerTenantId },
      _sum: { amount: true },
    }),
    prisma.referralMonthlyCommission.groupBy({
      by: ["status"],
      where: { referrerTenantId },
      _sum: { amount: true },
    }),
    prisma.tenant.count({ where: { referrerTenantId } }),
    prisma.tenant.count({ where: { referrerTenantId, status: "ACTIVE" } }),
    prisma.referralCommission.aggregate({
      where: {
        referrerTenantId,
        status: { in: ["PENDING", "AVAILABLE", "PAID"] },
      },
      _sum: { amount: true },
    }),
    prisma.referralMonthlyCommission.aggregate({
      where: {
        referrerTenantId,
        status: { in: ["PENDING", "AVAILABLE", "PAID"] },
      },
      _sum: { amount: true },
    }),
  ])

  const totals: Record<string, number> = {
    PENDING: 0,
    AVAILABLE: 0,
    PAID: 0,
    CANCELLED: 0,
  }
  for (const g of grouped) {
    totals[g.status] += Number(g._sum.amount ?? 0)
  }
  for (const g of monthlyGrouped) {
    totals[g.status] += Number(g._sum.amount ?? 0)
  }

  return {
    pending: totals.PENDING,
    available: totals.AVAILABLE,
    paid: totals.PAID,
    cancelled: totals.CANCELLED,
    totalReferrals: referralsCount,
    activeReferrals: activeReferralsCount,
    totalGenerated:
      Number(totalGenerated._sum.amount ?? 0) +
      Number(monthlyTotalGenerated._sum.amount ?? 0),
  }
}
