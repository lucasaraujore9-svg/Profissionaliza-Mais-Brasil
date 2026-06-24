import { Prisma } from "@prisma/client"
import type { ReferralCommission } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { createNotification } from "@/lib/notifications"
import { contextLogger } from "@/lib/logger"
import { swallow } from "@/lib/errors"
import { parseReferralTiers, resolveTierPercent } from "@/lib/referrals/tiers"
import { resolveCommissionRule } from "@/lib/referrals/rules"
import { CLAWBACK_MARKER_PREFIX, isClawbackMarked } from "@/lib/referrals/clawback"

const SETTINGS_ID = "default"
const DEFAULT_PERCENT = 5
const DEFAULT_PAYOUT_DAY = 20
const DEFAULT_MIN_REFERRALS = 3

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

async function readReferralSettings() {
  const row = await prisma.systemSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: {
      referralEnabled: true,
      defaultReferralPercent: true,
      referralPayoutDay: true,
      referralMinPayout: true,
      defaultReferralMinReferrals: true,
      commissionMode: true,
      commissionBracketBasis: true,
      commissionRateType: true,
      commissionPayoutBase: true,
      commissionBrackets: true,
    },
  })
  return {
    enabled: row?.referralEnabled ?? true,
    defaultPercent: Number(row?.defaultReferralPercent ?? DEFAULT_PERCENT),
    payoutDay: row?.referralPayoutDay ?? DEFAULT_PAYOUT_DAY,
    minPayout: Number(row?.referralMinPayout ?? 50),
    defaultMinReferrals:
      row?.defaultReferralMinReferrals ?? DEFAULT_MIN_REFERRALS,
    // Config global do motor por faixas — usada para decidir se ESTE indicador
    // opera por pagamento (legado) ou por fechamento mensal (MONTHLY_TIERED).
    commissionGlobal: row
      ? {
          commissionMode: row.commissionMode,
          commissionBracketBasis: row.commissionBracketBasis,
          commissionRateType: row.commissionRateType,
          commissionPayoutBase: row.commissionPayoutBase,
          commissionBrackets: row.commissionBrackets,
        }
      : null,
  }
}

/**
 * True se o indicador opera no motor MONTHLY_TIERED (faixas). Nesse caso as
 * comissoes NAO sao criadas por pagamento — o fechamento mensal
 * (src/lib/referrals/monthly.ts) apura tudo. Resolve override (Tenant) sobre o
 * padrao global (SystemSettings).
 */
function referrerUsesMonthlyEngine(
  referrer: {
    commissionMode: import("@prisma/client").CommissionMode | null
    commissionBracketBasis: import("@prisma/client").CommissionBracketBasis | null
    commissionRateType: import("@prisma/client").CommissionRateType | null
    commissionPayoutBase: import("@prisma/client").CommissionPayoutBase | null
    commissionBrackets: Prisma.JsonValue | null
  },
  settings: ReferralSettings,
): boolean {
  if (!settings.commissionGlobal) return false
  return resolveCommissionRule(referrer, settings.commissionGlobal).mode === "MONTHLY_TIERED"
}

type ReferralSettings = Awaited<ReturnType<typeof readReferralSettings>>

/**
 * Conta as unidades indicadas por `referrerTenantId` que estao ATIVAS.
 * E essa contagem que destrava a comissao de recorrencia (minimo de
 * indicacoes). Unidades canceladas/inadimplentes nao contam.
 */
async function countActiveReferrals(referrerTenantId: string): Promise<number> {
  return prisma.tenant.count({
    where: { referrerTenantId, status: "ACTIVE" },
  })
}

interface TpForCommission {
  id: string
  amount: Prisma.Decimal
  paidAt: Date
}
interface ReferredForCommission {
  id: string
  name: string
  referralPercent: Prisma.Decimal | null
  // Escala de comissao por tempo de vida desta unidade (quando configurada).
  referralTiers: Prisma.JsonValue | null
  // Base para contar os meses da escala (fallback createdAt).
  activatedAt: Date | null
  createdAt: Date
}
interface ReferrerForCommission {
  id: string
  owner: { email: string | null } | null
}

/**
 * Cria UMA ReferralCommission para uma TenantPayment ja paga, aplicando
 * anti-fraude (mesmo email entre donos), percentual e notificacao.
 *
 * NAO faz o gate de minimo de indicacoes — o caller decide se chama. Usada
 * tanto pelo fluxo direto (webhook) quanto pelo backfill retroativo.
 *
 * Idempotente por tenantPaymentId. Retorna null se anti-fraude bloquear,
 * percentual <= 0, ou a comissao ja existir via race resolvida.
 */
async function createCommissionRow(
  tp: TpForCommission,
  referred: ReferredForCommission,
  referrer: ReferrerForCommission,
  settings: ReferralSettings,
): Promise<ReferralCommission | null> {
  const existing = await prisma.referralCommission.findUnique({
    where: { tenantPaymentId: tp.id },
  })
  if (existing) return existing

  // Verificacao anti-fraude: mesmo email entre referrer.owner e referred.owner.
  if (referrer.owner?.email && referred.id !== referrer.id) {
    const referredOwner = await prisma.user.findFirst({
      where: { tenantId: referred.id },
      select: { email: true },
    })
    if (referredOwner?.email && referredOwner.email === referrer.owner.email) {
      contextLogger().warn(
        { event: "referrals.same_owner_email", referrerId: referrer.id, referredId: referred.id },
        "mesmo email entre referrer e referred — comissão não criada",
      )
      return null
    }
  }

  // Percentual efetivo: a escala por tempo de vida da unidade indicada tem
  // prioridade; sem escala, cai no override individual e depois no padrao
  // global. A escala conta meses de calendario desde a ativacao da unidade
  // (activatedAt; fallback createdAt) ate a data do pagamento.
  const tierPercent = resolveTierPercent(
    parseReferralTiers(referred.referralTiers),
    referred.activatedAt ?? referred.createdAt,
    tp.paidAt,
  )
  const percent =
    tierPercent != null
      ? tierPercent
      : referred.referralPercent != null
        ? Number(referred.referralPercent)
        : settings.defaultPercent

  if (!percent || percent <= 0) return null

  const baseAmount = new Prisma.Decimal(tp.amount)
  const percentDecimal = new Prisma.Decimal(percent)
  const amount = baseAmount.mul(percentDecimal).div(100).toDecimalPlaces(2)

  const availableAt = computeAvailableAt(tp.paidAt, settings.payoutDay)

  let commission: ReferralCommission
  try {
    commission = await prisma.referralCommission.create({
      data: {
        referrerTenantId: referrer.id,
        referredTenantId: referred.id,
        tenantPaymentId: tp.id,
        baseAmount,
        percent: percentDecimal,
        amount,
        status: "PENDING",
        availableAt,
      },
    })
  } catch (err) {
    // Race condition no unique tenantPaymentId
    const reread = await prisma.referralCommission.findUnique({
      where: { tenantPaymentId: tp.id },
    })
    if (reread) return reread
    throw err
  }

  // Notifica indicador
  const amountFmt = amount.toFixed(2).replace(".", ",")
  await createNotification({
    audience: "TENANT",
    tenantId: referrer.id,
    level: "SUCCESS",
    title: "Nova comissao de indicacao",
    body: `Voce ganhou R$ ${amountFmt} pela mensalidade de ${referred.name}. Liberacao em ${availableAt.toLocaleDateString("pt-BR")}.`,
    category: "referral",
    href: "/painel/indicacoes",
  })

  return commission
}

/**
 * Gera retroativamente as comissoes das mensalidades pagas das unidades
 * indicadas por `referrerTenantId`, caso o indicador ja tenha atingido o
 * minimo de indicacoes ATIVAS.
 *
 * Enquanto o indicador esta abaixo do minimo, as comissoes nao sao criadas
 * (ficam "retidas"). Assim que ele atinge o minimo, esta funcao varre as
 * mensalidades pagas que ainda nao tem comissao e as cria — incluindo as do
 * periodo retido. Idempotente: pula mensalidades que ja possuem comissao.
 *
 * Retorna a quantidade de comissoes criadas nesta chamada.
 */
export async function backfillReferrerCommissions(
  referrerTenantId: string,
): Promise<number> {
  const settings = await readReferralSettings()
  if (!settings.enabled) return 0

  const referrer = await prisma.tenant.findUnique({
    where: { id: referrerTenantId },
    select: {
      id: true,
      referralMinReferrals: true,
      owner: { select: { email: true } },
      commissionMode: true,
      commissionBracketBasis: true,
      commissionRateType: true,
      commissionPayoutBase: true,
      commissionBrackets: true,
    },
  })
  if (!referrer) return 0

  // Modo por faixas: o fechamento mensal (monthly.ts) cuida; nao retrocria
  // comissoes por pagamento para esse indicador.
  if (referrerUsesMonthlyEngine(referrer, settings)) return 0

  const minReferrals = referrer.referralMinReferrals ?? settings.defaultMinReferrals
  if (minReferrals > 0) {
    const activeReferrals = await countActiveReferrals(referrer.id)
    if (activeReferrals < minReferrals) return 0 // ainda nao elegivel
  }

  const referredTenants = await prisma.tenant.findMany({
    where: { referrerTenantId },
    select: {
      id: true,
      name: true,
      referralPercent: true,
      referralTiers: true,
      activatedAt: true,
      createdAt: true,
    },
  })
  if (referredTenants.length === 0) return 0

  const referredById = new Map(referredTenants.map((r) => [r.id, r]))

  // Mensalidades pagas das indicadas que ainda nao geraram comissao.
  const paidPayments = await prisma.tenantPayment.findMany({
    where: {
      tenantId: { in: referredTenants.map((r) => r.id) },
      paidAt: { not: null },
      referralCommission: { is: null },
    },
    select: { id: true, tenantId: true, amount: true, paidAt: true },
  })

  let created = 0
  for (const tp of paidPayments) {
    const referred = referredById.get(tp.tenantId)
    if (!referred || !tp.paidAt) continue
    const row = await createCommissionRow(
      { id: tp.id, amount: tp.amount, paidAt: tp.paidAt },
      referred,
      referrer,
      settings,
    )
    if (row) created += 1
  }
  return created
}

/**
 * Cria a comissao de indicacao para uma TenantPayment recebida.
 *
 * Regra anti-piramide: SEMPRE 1 nivel apenas. Nunca olhamos referrer.referrerTenantId.
 *
 * Idempotente: se ja existe ReferralCommission com este tenantPaymentId, retorna a existente.
 * Retorna null se:
 *   - feature desativada
 *   - referredTenant nao tem referrerTenantId
 *   - referrerTenantId aponta para tenant inexistente
 *   - tenantPayment nao pago (sem paidAt)
 *   - indicador ainda nao atingiu o minimo de indicacoes ATIVAS (gate);
 *     nesse caso a comissao fica retida e e gerada retroativamente depois.
 *
 * Ao criar (gate aberto), dispara o backfill retroativo do indicador.
 * Notifica o indicador (in-app) ao criar a comissao.
 */
export async function createCommissionForTenantPayment(
  tenantPaymentId: string,
): Promise<ReferralCommission | null> {
  // Idempotencia
  const existing = await prisma.referralCommission.findUnique({
    where: { tenantPaymentId },
  })
  if (existing) return existing

  const settings = await readReferralSettings()
  if (!settings.enabled) return null

  const tp = await prisma.tenantPayment.findUnique({
    where: { id: tenantPaymentId },
    select: {
      id: true,
      tenantId: true,
      amount: true,
      paidAt: true,
      status: true,
    },
  })
  if (!tp) return null
  if (!tp.paidAt) return null

  const referred = await prisma.tenant.findUnique({
    where: { id: tp.tenantId },
    select: {
      id: true,
      name: true,
      referrerTenantId: true,
      referralPercent: true,
      referralTiers: true,
      activatedAt: true,
      createdAt: true,
    },
  })
  if (!referred?.referrerTenantId) return null

  // 1-nivel apenas: nunca olhamos referrer.referrerTenantId
  const referrer = await prisma.tenant.findUnique({
    where: { id: referred.referrerTenantId },
    select: {
      id: true,
      referralMinReferrals: true,
      owner: { select: { email: true } },
      commissionMode: true,
      commissionBracketBasis: true,
      commissionRateType: true,
      commissionPayoutBase: true,
      commissionBrackets: true,
    },
  })
  if (!referrer) return null

  // Modo por faixas: comissao apurada no fechamento mensal (monthly.ts), nunca
  // por pagamento individual. Nao cria ReferralCommission para esse indicador.
  if (referrerUsesMonthlyEngine(referrer, settings)) return null

  // GATE: a unidade indicadora so recebe comissao de recorrencia depois de
  // atingir o minimo de indicacoes ATIVAS (override por unidade ou padrao
  // global). Enquanto nao atinge, a comissao fica "retida" (nao criada) e
  // sera gerada retroativamente assim que o minimo for alcancado.
  const minReferrals =
    referrer.referralMinReferrals ?? settings.defaultMinReferrals
  if (minReferrals > 0) {
    const activeReferrals = await countActiveReferrals(referrer.id)
    if (activeReferrals < minReferrals) return null
  }

  // Gate aberto: cria a comissao desta mensalidade...
  const commission = await createCommissionRow(
    { id: tp.id, amount: tp.amount, paidAt: tp.paidAt },
    referred,
    referrer,
    settings,
  )

  // ...e faz o backfill retroativo das mensalidades retidas enquanto o gate
  // estava fechado (idempotente — pula as que ja tem comissao).
  await backfillReferrerCommissions(referrer.id).catch((err) => {
    contextLogger().error(
      { err, event: "referrals.backfill_failed", referrerTenantId: referrer.id },
      "backfill de comissoes retroativas falhou",
    )
  })

  return commission
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
