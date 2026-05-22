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
 * Fluxo AUTOMATICO (revendedor nao solicita saque):
 *   1. Promove ReferralCommission PENDING → AVAILABLE quando availableAt <= now().
 *   2. Para cada referrer com saldo AVAILABLE (mesmo abaixo do minimo), cria
 *      automaticamente um ReferralPayout em status REQUESTED, vinculando as
 *      comissoes. Admin processa o PIX e marca como PAID via /admin/indicacoes/saques.
 *   3. Notifica admin (precisa processar) e revendedor (saiu da casinha).
 *
 * Idempotente: comissoes ja vinculadas a um payout (payoutId != null) sao puladas.
 */
export async function processMonthlyPayouts(): Promise<{
  released: number
  payoutsCreated: number
  notifiedTenants: number
}> {
  const settings = await readSettings()
  if (!settings.enabled) {
    return { released: 0, payoutsCreated: 0, notifiedTenants: 0 }
  }

  const now = new Date()

  // 1. Promove PENDING → AVAILABLE para todas que ja venceram
  const eligible = await prisma.referralCommission.findMany({
    where: {
      status: "PENDING",
      availableAt: { lte: now },
    },
    select: { id: true, referrerTenantId: true, amount: true },
  })

  if (eligible.length > 0) {
    await prisma.referralCommission.updateMany({
      where: { id: { in: eligible.map((c) => c.id) } },
      data: { status: "AVAILABLE" },
    })
  }

  // 2. Cria payouts automaticos para todos os referrers com saldo AVAILABLE
  // (independente do minimo — pagamento e mensal sem solicitacao).
  // Inclui comissoes que ja estavam AVAILABLE de meses anteriores e ainda nao
  // tinham payout (raro, mas pode ocorrer se houve falha no cron passado).
  const availableUnattached = await prisma.referralCommission.findMany({
    where: {
      status: "AVAILABLE",
      payoutId: null,
    },
    select: { id: true, referrerTenantId: true, amount: true },
  })

  // Agrupa por referrer
  const byReferrer = new Map<
    string,
    { total: Prisma.Decimal; ids: string[] }
  >()
  for (const c of availableUnattached) {
    const cur = byReferrer.get(c.referrerTenantId) ?? {
      total: new Prisma.Decimal(0),
      ids: [],
    }
    cur.total = cur.total.add(c.amount)
    cur.ids.push(c.id)
    byReferrer.set(c.referrerTenantId, cur)
  }

  let payoutsCreated = 0
  let notifiedTenants = 0

  for (const [tenantId, { total, ids }] of byReferrer.entries()) {
    // Pula referrers que ja tem um payout em aberto (REQUESTED/PROCESSING)
    const existingPending = await prisma.referralPayout.findFirst({
      where: {
        referrerTenantId: tenantId,
        status: { in: ["REQUESTED", "PROCESSING"] },
      },
      select: { id: true },
    })
    if (existingPending) continue

    // Carrega PIX cadastrado do tenant (pode ser null — admin vai processar
    // como MANUAL nesse caso)
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, pixKey: true, pixKeyType: true },
    })
    const hasPix = Boolean(tenant?.pixKey && tenant?.pixKeyType)

    const payout = await prisma.referralPayout.create({
      data: {
        referrerTenantId: tenantId,
        amount: total,
        method: hasPix ? "ASAAS_PIX" : "MANUAL",
        status: "REQUESTED",
        pixKey: tenant?.pixKey ?? null,
        pixKeyType: tenant?.pixKeyType ?? null,
        requestedAt: now,
        notes:
          "Gerado automaticamente pelo cron mensal (pagamento dia X do mes seguinte).",
      },
    })

    await prisma.referralCommission.updateMany({
      where: { id: { in: ids } },
      data: { payoutId: payout.id },
    })
    payoutsCreated += 1

    // Notifica revendedor
    await createNotification({
      audience: "TENANT",
      tenantId,
      level: "SUCCESS",
      title: "Comissao de indicacao processada",
      body: `R$ ${total.toFixed(2).replace(".", ",")} em pagamento. Voce recebera no PIX cadastrado.`,
      category: "referral",
      href: "/painel/indicacoes",
    })

    // Notifica admin
    await createNotification({
      audience: "ROLE",
      roleTarget: "SUPER_ADMIN",
      level: "WARNING",
      title: `Comissao a pagar: ${tenant?.name ?? tenantId}`,
      body: `R$ ${total.toFixed(2).replace(".", ",")} ${hasPix ? "via PIX" : "(sem PIX cadastrado, pagar manual)"}. Processar em /admin/indicacoes/saques.`,
      category: "referral",
      href: "/admin/indicacoes/saques",
    })
    notifiedTenants += 1
  }

  return {
    released: eligible.length,
    payoutsCreated,
    notifiedTenants,
  }
}
