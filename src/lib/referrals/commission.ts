import { Prisma } from "@prisma/client"
import type { ReferralCommission } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { createNotification } from "@/lib/notifications"
import { contextLogger } from "@/lib/logger"

const SETTINGS_ID = "default"
const DEFAULT_PERCENT = 5
const DEFAULT_PAYOUT_DAY = 20

/**
 * Calcula a data em que a comissao fica disponivel para saque.
 * Regra: dia X (SystemSettings.referralPayoutDay, default 20) do mes seguinte ao paidAt.
 *
 * Exemplos (payoutDay=20):
 *   2026-02-15 → 2026-03-20
 *   2026-02-28 → 2026-03-20
 *   2026-03-01 → 2026-04-20
 */
export function computeAvailableAt(paidAt: Date, payoutDay = DEFAULT_PAYOUT_DAY): Date {
  const d = new Date(paidAt)
  d.setUTCMonth(d.getUTCMonth() + 1)
  d.setUTCDate(payoutDay)
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
    },
  })
  return {
    enabled: row?.referralEnabled ?? true,
    defaultPercent: Number(row?.defaultReferralPercent ?? DEFAULT_PERCENT),
    payoutDay: row?.referralPayoutDay ?? DEFAULT_PAYOUT_DAY,
    minPayout: Number(row?.referralMinPayout ?? 50),
  }
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
 *
 * Notifica o indicador (in-app + email) ao criar a comissao.
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
    },
  })
  if (!referred?.referrerTenantId) return null

  // 1-nivel apenas: nunca olhamos referrer.referrerTenantId
  const referrer = await prisma.tenant.findUnique({
    where: { id: referred.referrerTenantId },
    select: {
      id: true,
      name: true,
      owner: { select: { id: true, name: true, email: true } },
    },
  })
  if (!referrer) return null

  // Verificacao anti-fraude: mesmo CPF/CNPJ entre referrer.owner e referred.owner
  // Aqui usamos os Users (donos do tenant) — comparamos email como proxy.
  // Idealmente seria asaasCustomerId/CPF, mas nao temos no User; fica como log de alerta.
  // Skip se nao for possivel comparar.
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

  const percent =
    referred.referralPercent != null
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
      where: { tenantPaymentId },
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

  // Email de comissao: deixado para uma futura template dedicada.
  // Por enquanto, a notificacao in-app cobre o caso.

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
    contextLogger().warn(
      { event: "referrals.cancel_after_paid", commissionId: commission.id, reason },
      "cancel solicitado mas comissão já paga",
    )
    await createNotification({
      audience: "ROLE",
      roleTarget: "SUPER_ADMIN",
      level: "WARNING",
      title: `Estorno apos comissao paga: ${commission.referrer.name}`,
      body: `A comissao ${commission.id} (R$ ${Number(commission.amount).toFixed(2).replace(".", ",")}) ja havia sido paga ao indicador ${commission.referrer.name}, mas a mensalidade ${commission.referred.name} foi estornada. Tratar manualmente.`,
      category: "referral",
      href: `/admin/indicacoes/comissoes`,
    })
    return commission
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

export interface ReferralSummary {
  pending: number
  available: number
  paid: number
  cancelled: number
  totalReferrals: number
  totalGenerated: number
}

/**
 * Retorna totais por tenant (referrer): pendente / disponivel / pago / cancelado.
 */
export async function summaryForTenant(referrerTenantId: string): Promise<ReferralSummary> {
  const [grouped, referralsCount, totalGenerated] = await Promise.all([
    prisma.referralCommission.groupBy({
      by: ["status"],
      where: { referrerTenantId },
      _sum: { amount: true },
    }),
    prisma.tenant.count({ where: { referrerTenantId } }),
    prisma.referralCommission.aggregate({
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
    totals[g.status] = Number(g._sum.amount ?? 0)
  }

  return {
    pending: totals.PENDING,
    available: totals.AVAILABLE,
    paid: totals.PAID,
    cancelled: totals.CANCELLED,
    totalReferrals: referralsCount,
    totalGenerated: Number(totalGenerated._sum.amount ?? 0),
  }
}
