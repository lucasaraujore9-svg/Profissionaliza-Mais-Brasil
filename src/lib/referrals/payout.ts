import { Prisma } from "@prisma/client"
import type { ReferralPayout, ReferralPayoutMethod } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { createNotification } from "@/lib/notifications"

const SETTINGS_ID = "default"

async function readSettings() {
  const row = await prisma.systemSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: {
      referralEnabled: true,
      referralMinPayout: true,
      referralPayoutDay: true,
    },
  })
  return {
    enabled: row?.referralEnabled ?? true,
    minPayout: Number(row?.referralMinPayout ?? 50),
    payoutDay: row?.referralPayoutDay ?? 20,
  }
}

export interface RequestPayoutInput {
  referrerTenantId: string
  method: ReferralPayoutMethod
  pixKey?: string | null
  pixKeyType?: string | null
}

export class ReferralPayoutError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "DISABLED"
      | "NO_BALANCE"
      | "BELOW_MIN"
      | "INVALID_PIX"
      | "ALREADY_PENDING",
  ) {
    super(message)
    this.name = "ReferralPayoutError"
  }
}

/**
 * Solicita um saque para o referrer. Agrupa todas as comissoes AVAILABLE
 * e cria uma ReferralPayout com status REQUESTED.
 *
 * Validacoes:
 *   - feature ativa
 *   - saldo AVAILABLE >= referralMinPayout
 *   - para ASAAS_PIX: pixKey + pixKeyType obrigatorios
 *   - nao permite multiplos saques REQUESTED/PROCESSING simultaneos
 */
export async function requestPayout(
  input: RequestPayoutInput,
): Promise<ReferralPayout> {
  const settings = await readSettings()
  if (!settings.enabled) {
    throw new ReferralPayoutError(
      "Sistema de indicacoes desativado",
      "DISABLED",
    )
  }

  if (input.method === "ASAAS_PIX") {
    if (!input.pixKey || !input.pixKeyType) {
      throw new ReferralPayoutError(
        "Chave PIX e tipo sao obrigatorios para saque via PIX",
        "INVALID_PIX",
      )
    }
  }

  // Bloqueia se ja existe payout em aberto
  const pending = await prisma.referralPayout.findFirst({
    where: {
      referrerTenantId: input.referrerTenantId,
      status: { in: ["REQUESTED", "PROCESSING"] },
    },
    select: { id: true },
  })
  if (pending) {
    throw new ReferralPayoutError(
      "Voce ja possui um saque em andamento. Aguarde a aprovacao para solicitar outro.",
      "ALREADY_PENDING",
    )
  }

  // Calcula saldo AVAILABLE
  const available = await prisma.referralCommission.findMany({
    where: {
      referrerTenantId: input.referrerTenantId,
      status: "AVAILABLE",
    },
    select: { id: true, amount: true },
  })
  if (available.length === 0) {
    throw new ReferralPayoutError("Sem comissoes disponiveis", "NO_BALANCE")
  }
  const totalAmount = available.reduce(
    (acc, c) => acc.add(c.amount),
    new Prisma.Decimal(0),
  )

  if (totalAmount.lt(settings.minPayout)) {
    throw new ReferralPayoutError(
      `Saldo abaixo do minimo (R$ ${settings.minPayout.toFixed(2).replace(".", ",")})`,
      "BELOW_MIN",
    )
  }

  const payout = await prisma.referralPayout.create({
    data: {
      referrerTenantId: input.referrerTenantId,
      amount: totalAmount,
      method: input.method,
      status: "REQUESTED",
      pixKey: input.method === "ASAAS_PIX" ? input.pixKey ?? null : null,
      pixKeyType: input.method === "ASAAS_PIX" ? input.pixKeyType ?? null : null,
      requestedAt: new Date(),
    },
  })

  // Vincula as comissoes a este payout (sem trocar status — ele troca quando paid)
  await prisma.referralCommission.updateMany({
    where: { id: { in: available.map((c) => c.id) } },
    data: { payoutId: payout.id },
  })

  // Notifica admins
  const tenant = await prisma.tenant.findUnique({
    where: { id: input.referrerTenantId },
    select: { name: true },
  })
  await createNotification({
    audience: "ROLE",
    roleTarget: "SUPER_ADMIN",
    level: "INFO",
    title: `Novo saque de indicacao solicitado: ${tenant?.name ?? input.referrerTenantId}`,
    body: `R$ ${totalAmount.toFixed(2)} via ${input.method}. Aprove em /admin/indicacoes/saques.`,
    category: "referral",
    href: "/admin/indicacoes/saques",
  })

  return payout
}

/**
 * Marca um payout como PAID. Atualiza comissoes vinculadas para PAID.
 * Se ASAAS_PIX, recebe opcionalmente o asaasTransferId.
 */
export async function markPayoutPaid(
  payoutId: string,
  asaasTransferId?: string | null,
): Promise<ReferralPayout> {
  const payout = await prisma.referralPayout.findUnique({
    where: { id: payoutId },
    include: { referrer: { select: { id: true, name: true } } },
  })
  if (!payout) throw new Error(`Payout ${payoutId} nao encontrado`)
  if (payout.status === "PAID") return payout

  const now = new Date()
  const updated = await prisma.referralPayout.update({
    where: { id: payoutId },
    data: {
      status: "PAID",
      asaasTransferId: asaasTransferId ?? payout.asaasTransferId ?? null,
      processedAt: payout.processedAt ?? now,
      paidAt: now,
    },
  })

  await prisma.referralCommission.updateMany({
    where: { payoutId },
    data: { status: "PAID", paidAt: now },
  })

  await createNotification({
    audience: "TENANT",
    tenantId: payout.referrerTenantId,
    level: "SUCCESS",
    title: "Saque de indicacao pago",
    body: `R$ ${Number(payout.amount).toFixed(2).replace(".", ",")} liberado.`,
    category: "referral",
    href: "/painel/indicacoes",
  })

  return updated
}

/**
 * Marca um payout como FAILED com motivo. Desvincula comissoes (voltam para AVAILABLE).
 */
export async function failPayout(
  payoutId: string,
  reason: string,
): Promise<ReferralPayout> {
  const payout = await prisma.referralPayout.findUnique({
    where: { id: payoutId },
  })
  if (!payout) throw new Error(`Payout ${payoutId} nao encontrado`)

  const updated = await prisma.referralPayout.update({
    where: { id: payoutId },
    data: {
      status: "FAILED",
      failureReason: reason,
      processedAt: new Date(),
    },
  })

  // Desvincula comissoes (continuam AVAILABLE)
  await prisma.referralCommission.updateMany({
    where: { payoutId },
    data: { payoutId: null },
  })

  await createNotification({
    audience: "TENANT",
    tenantId: payout.referrerTenantId,
    level: "ERROR",
    title: "Saque de indicacao recusado",
    body: reason,
    category: "referral",
    href: "/painel/indicacoes",
  })

  return updated
}

/**
 * Executado pelo cron mensal (dia X).
 *
 * 1. Promove ReferralCommission PENDING → AVAILABLE quando availableAt <= now().
 * 2. Notifica cada referrer com saldo recem-liberado.
 *
 * MVP: NAO cria payouts automaticamente — revendedor solicita manualmente.
 *
 * Futura melhoria: se Tenant.pixKey preenchido e saldo AVAILABLE >= referralMinPayout,
 * criar automaticamente um ReferralPayout REQUESTED para aprovacao do admin.
 */
export async function processMonthlyPayouts(): Promise<{
  released: number
  notifiedTenants: number
}> {
  const now = new Date()

  // Promove PENDING → AVAILABLE para todas que ja venceram
  const eligible = await prisma.referralCommission.findMany({
    where: {
      status: "PENDING",
      availableAt: { lte: now },
    },
    select: { id: true, referrerTenantId: true, amount: true },
  })

  if (eligible.length === 0) {
    return { released: 0, notifiedTenants: 0 }
  }

  await prisma.referralCommission.updateMany({
    where: { id: { in: eligible.map((c) => c.id) } },
    data: { status: "AVAILABLE" },
  })

  // Agrupa por referrer para notificar
  const byReferrer = new Map<string, Prisma.Decimal>()
  for (const c of eligible) {
    const prev = byReferrer.get(c.referrerTenantId) ?? new Prisma.Decimal(0)
    byReferrer.set(c.referrerTenantId, prev.add(c.amount))
  }

  let notifiedTenants = 0
  for (const [tenantId, total] of byReferrer.entries()) {
    await createNotification({
      audience: "TENANT",
      tenantId,
      level: "SUCCESS",
      title: "Comissoes disponiveis para saque",
      body: `R$ ${total.toFixed(2).replace(".", ",")} liberado(s). Solicite o saque em /painel/indicacoes.`,
      category: "referral",
      href: "/painel/indicacoes",
    })
    notifiedTenants += 1
  }

  return { released: eligible.length, notifiedTenants }
}
