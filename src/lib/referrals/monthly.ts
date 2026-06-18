/**
 * Motor de comissao por FAIXAS (MONTHLY_TIERED) — calculo do fechamento mensal.
 *
 * Para cada indicador cujo modo efetivo e MONTHLY_TIERED, apura UMA comissao do
 * mes (ReferralMonthlyCommission, idempotente em (referrer, period)):
 *   1. Conta o que determina a faixa: novas revendas indicadas no mes OU nº de
 *      unidades ativas (rule.bracketBasis).
 *   2. Escolhe a faixa -> rate (R$ por unidade se FIXED, % se PERCENT).
 *   3. Define a base de pagamento: TODAS as ativas OU so as indicadas no mes
 *      (rule.payoutBase), sempre excluindo cortesia (planValue = 0).
 *   4. Valor: FIXED = rate × nº de unidades da base; PERCENT = Σ (mensalidade
 *      recebida no mes × rate / 100) por unidade da base.
 *
 * A liquidacao (transferencia manual + comprovante para dar baixa) e a mesma do
 * motor legado: ReferralMonthlyCommission entra no ReferralPayout em ./payout.ts.
 */
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { createNotification } from "@/lib/notifications"
import { computeAvailableAt } from "@/lib/referrals/commission"
import {
  resolveCommissionRule,
  resolveBracket,
  type CommissionRule,
  type GlobalCommissionConfig,
} from "@/lib/referrals/rules"

const SETTINGS_ID = "default"
const DEFAULT_PAYOUT_DAY = 20
// Status de TenantPayment considerados "mensalidade recebida" (alinha com
// /api/admin/financeiro). Usado no modo PERCENT.
const RECEIVED_STATUSES = ["RECEIVED", "CONFIRMED"]

interface MonthlyLine {
  tenantId: string
  name: string
  /** Mensalidade recebida no mes (PERCENT) ou planValue (FIXED). */
  mensalidade: number
  /** Contribuicao desta unidade para a comissao do mes. */
  amount: number
}

function monthRange(period: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(period)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2]) // 1-12
  if (month < 1 || month > 12) return null
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)) // exclusivo
  return { start, end }
}

/** Period "AAAA-MM" do mes anterior ao `ref`. */
export function previousPeriod(ref: Date): string {
  const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1))
  d.setUTCMonth(d.getUTCMonth() - 1)
  const y = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
  return `${y}-${mm}`
}

/**
 * Os `count` meses fechados mais recentes em "AAAA-MM", do mais antigo ao mais
 * novo (o ultimo e o mes anterior a `ref`, == previousPeriod(ref)).
 *
 * Usado pelo cron para apurar COM CATCH-UP: ao contrario do motor legado (que se
 * auto-cura via backfillReferrerCommissions varrendo todas as mensalidades sem
 * comissao), o motor por faixas so cria a linha do mes quando o fechamento roda.
 * Se um mes for pulado (ex.: o cron pg_cron ficou fora do ar), recalcular uma
 * janela de meses garante que a competencia perdida ainda seja fechada no
 * proximo run. Idempotente — meses ja AVAILABLE/PAID/vinculados sao pulados.
 */
export function recentClosedPeriods(ref: Date, count: number): string[] {
  const out: string[] = []
  const base = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1))
  for (let i = count; i >= 1; i--) {
    const d = new Date(base)
    d.setUTCMonth(d.getUTCMonth() - i)
    out.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
    )
  }
  return out
}

/**
 * Apura as comissoes mensais por faixas para todos os indicadores em modo
 * MONTHLY_TIERED, para o mes `period` ("AAAA-MM"). Idempotente: nao recalcula
 * comissoes ja vinculadas a um payout ou pagas.
 */
export async function computeMonthlyCommissions(period: string): Promise<{
  processed: number
  created: number
  updated: number
  skipped: number
}> {
  const range = monthRange(period)
  if (!range) throw new Error(`period invalido: ${period} (esperado AAAA-MM)`)

  const settings = await prisma.systemSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: {
      referralEnabled: true,
      referralPayoutDay: true,
      commissionMode: true,
      commissionBracketBasis: true,
      commissionRateType: true,
      commissionPayoutBase: true,
      commissionBrackets: true,
    },
  })
  if (!settings?.referralEnabled) {
    return { processed: 0, created: 0, updated: 0, skipped: 0 }
  }

  const global: GlobalCommissionConfig = {
    commissionMode: settings.commissionMode,
    commissionBracketBasis: settings.commissionBracketBasis,
    commissionRateType: settings.commissionRateType,
    commissionPayoutBase: settings.commissionPayoutBase,
    commissionBrackets: settings.commissionBrackets,
  }
  const payoutDay = settings.referralPayoutDay ?? DEFAULT_PAYOUT_DAY
  const availableAt = computeAvailableAt(range.start, payoutDay)

  const referrers = await prisma.tenant.findMany({
    where: { referrals: { some: {} } },
    select: {
      id: true,
      name: true,
      commissionMode: true,
      commissionBracketBasis: true,
      commissionRateType: true,
      commissionPayoutBase: true,
      commissionBrackets: true,
    },
  })

  let processed = 0
  let created = 0
  let updated = 0
  let skipped = 0

  for (const referrer of referrers) {
    const rule = resolveCommissionRule(referrer, global)
    if (rule.mode !== "MONTHLY_TIERED") continue // motor legado cuida desses
    processed++
    const outcome = await computeForReferrer(
      referrer.id,
      referrer.name,
      rule,
      period,
      range,
      availableAt,
    )
    if (outcome === "created") created++
    else if (outcome === "updated") updated++
    else skipped++
  }

  return { processed, created, updated, skipped }
}

async function computeForReferrer(
  referrerTenantId: string,
  referrerName: string,
  rule: CommissionRule,
  period: string,
  range: { start: Date; end: Date },
  availableAt: Date,
): Promise<"created" | "updated" | "skipped"> {
  // Idempotencia: nao mexe no que ja foi liberado/liquidado/pago. So recalcula
  // linhas ainda PENDING e nao vinculadas — uma vez AVAILABLE, o valor que a
  // revenda ja viu nao pode encolher nem ser apagado por um reprocessamento.
  const existing = await prisma.referralMonthlyCommission.findUnique({
    where: { referrerTenantId_period: { referrerTenantId, period } },
    select: { id: true, status: true, payoutId: true },
  })
  if (
    existing &&
    (existing.status === "PAID" ||
      existing.status === "AVAILABLE" ||
      existing.payoutId)
  ) {
    return "skipped"
  }

  // 1) Contagem que determina a faixa.
  const bracketCount =
    rule.bracketBasis === "NEW_REFERRALS_MONTH"
      ? await prisma.tenant.count({
          where: {
            referrerTenantId,
            status: "ACTIVE",
            createdAt: { gte: range.start, lt: range.end },
          },
        })
      : await prisma.tenant.count({
          where: { referrerTenantId, status: "ACTIVE" },
        })

  const bracket = resolveBracket(rule.brackets, bracketCount)
  if (!bracket) {
    // Sem faixas configuradas — nada a pagar.
    return removeIfExists(existing?.id)
  }

  // 2) Unidades da base de pagamento (cortesia planValue=0 nao gera pagamento).
  const baseUnits = await prisma.tenant.findMany({
    where:
      rule.payoutBase === "REFERRED_THIS_MONTH"
        ? {
            referrerTenantId,
            status: "ACTIVE",
            planValue: { gt: 0 },
            createdAt: { gte: range.start, lt: range.end },
          }
        : { referrerTenantId, status: "ACTIVE", planValue: { gt: 0 } },
    select: { id: true, name: true, planValue: true },
  })

  // 3) Calculo do valor.
  const rate = new Prisma.Decimal(bracket.value)
  let amount = new Prisma.Decimal(0)
  let baseSum = new Prisma.Decimal(0)
  const lines: MonthlyLine[] = []

  if (rule.rateType === "FIXED") {
    // R$ por cada unidade ativa da base (independe de pagamento no mes).
    amount = rate.mul(baseUnits.length)
    for (const u of baseUnits) {
      lines.push({
        tenantId: u.id,
        name: u.name,
        mensalidade: Number(u.planValue),
        amount: bracket.value,
      })
    }
  } else {
    // PERCENT: % sobre a mensalidade efetivamente recebida no mes de cada unidade.
    const baseIds = baseUnits.map((u) => u.id)
    const paidByTenant = new Map<string, Prisma.Decimal>()
    if (baseIds.length > 0) {
      const grouped = await prisma.tenantPayment.groupBy({
        by: ["tenantId"],
        where: {
          tenantId: { in: baseIds },
          status: { in: RECEIVED_STATUSES },
          paidAt: { gte: range.start, lt: range.end },
          // Anti-duplicidade na transicao de motor: NAO conta mensalidades que ja
          // geraram uma ReferralCommission legada nao-cancelada — senao um
          // indicador migrado de PER_PAYMENT_PERCENT para MONTHLY_TIERED com
          // comissoes legadas ainda PENDING/AVAILABLE/PAID receberia o mesmo
          // pagamento duas vezes (uma por motor). A comissao legada paga esses;
          // o motor por faixas cobre apenas o que nao tem comissao legada viva.
          OR: [
            { referralCommission: { is: null } },
            { referralCommission: { status: "CANCELLED" } },
          ],
        },
        _sum: { amount: true },
      })
      for (const g of grouped) {
        paidByTenant.set(g.tenantId, new Prisma.Decimal(g._sum.amount ?? 0))
      }
    }
    const byId = new Map(baseUnits.map((u) => [u.id, u]))
    for (const u of baseUnits) {
      const mensalidade = paidByTenant.get(u.id) ?? new Prisma.Decimal(0)
      if (mensalidade.lte(0)) continue // unidade nao pagou no mes
      const line = mensalidade.mul(rate).div(100).toDecimalPlaces(2)
      baseSum = baseSum.add(mensalidade)
      amount = amount.add(line)
      lines.push({
        tenantId: u.id,
        name: byId.get(u.id)?.name ?? u.name,
        mensalidade: Number(mensalidade),
        amount: Number(line),
      })
    }
  }

  amount = amount.toDecimalPlaces(2)
  if (amount.lte(0)) {
    return removeIfExists(existing?.id)
  }

  const unitCount = lines.length
  const data = {
    mode: rule.mode,
    bracketBasis: rule.bracketBasis,
    rateType: rule.rateType,
    payoutBase: rule.payoutBase,
    bracketIndex: bracket.index,
    bracketCount,
    rate,
    unitCount,
    baseSum,
    amount,
    linesSnapshot: lines as unknown as Prisma.InputJsonValue,
    availableAt,
  }

  if (existing) {
    await prisma.referralMonthlyCommission.update({
      where: { id: existing.id },
      data,
    })
    return "updated"
  }

  await prisma.referralMonthlyCommission.create({
    data: { referrerTenantId, period, status: "PENDING", ...data },
  })

  await createNotification({
    audience: "TENANT",
    tenantId: referrerTenantId,
    level: "SUCCESS",
    title: "Nova comissao de indicacao",
    body: `Comissao de ${period} apurada: R$ ${amount
      .toFixed(2)
      .replace(".", ",")} (${unitCount} unidade${unitCount === 1 ? "" : "s"}). Liberacao em ${availableAt.toLocaleDateString("pt-BR")}.`,
    category: "referral",
    href: "/painel/indicacoes",
  }).catch(() => {})

  return "created"
}

/**
 * Remove uma comissao mensal nao-liquidada que recalculou para 0 (faixa
 * inexistente ou base vazia). Mantem o ledger limpo entre reprocessamentos.
 */
async function removeIfExists(
  id: string | undefined,
): Promise<"updated" | "skipped"> {
  if (!id) return "skipped"
  await prisma.referralMonthlyCommission.delete({ where: { id } })
  return "updated"
}

/**
 * Trata o estorno (refund) de uma mensalidade no motor por faixas, espelhando o
 * clawback do motor legado (cancelCommissionForTenantPayment):
 *  - PENDING: nao mexe — o proximo fechamento recalcula e exclui a mensalidade
 *    estornada (status deixa de ser RECEIVED/CONFIRMED), entao se auto-corrige.
 *  - AVAILABLE/PAID: marca [CLAWBACK_PENDING] em cancelReason + cancelledAt e
 *    notifica o SUPER_ADMIN. O gate em processMonthlyPayouts entao BLOQUEIA
 *    novos payouts automaticos do indicador ate o admin resolver.
 *
 * Chamado pelo webhook Asaas no refund TOTAL (ver src/lib/asaas/process.ts).
 * Idempotente: nao re-marca uma linha ja marcada.
 */
export async function flagMonthlyCommissionForRefund(
  tenantPaymentId: string,
  reason: string,
): Promise<void> {
  const tp = await prisma.tenantPayment.findUnique({
    where: { id: tenantPaymentId },
    select: { tenantId: true, paidAt: true },
  })
  if (!tp?.paidAt) return

  const referred = await prisma.tenant.findUnique({
    where: { id: tp.tenantId },
    select: { name: true, referrerTenantId: true },
  })
  if (!referred?.referrerTenantId) return

  const period = `${tp.paidAt.getUTCFullYear()}-${String(
    tp.paidAt.getUTCMonth() + 1,
  ).padStart(2, "0")}`

  const monthly = await prisma.referralMonthlyCommission.findUnique({
    where: {
      referrerTenantId_period: {
        referrerTenantId: referred.referrerTenantId,
        period,
      },
    },
    select: {
      id: true,
      status: true,
      amount: true,
      rateType: true,
      cancelReason: true,
      referrer: { select: { name: true } },
    },
  })
  if (!monthly) return
  // FIXED: o valor e rate x nº de unidades ATIVAS, nao depende da mensalidade
  // estornada (so PERCENT soma pagamentos recebidos). Estornar 1 mensalidade nao
  // reduz a comissao FIXA do mes — o proximo fechamento ja reflete a unidade que
  // por ventura saia. Marcar clawback aqui bloquearia o indicador inteiro por um
  // valor que nunca veio daquele pagamento. So PERCENT entra em clawback.
  if (monthly.rateType === "FIXED") return
  if (monthly.status === "PENDING") return // recompute do proximo fechamento resolve
  if (monthly.cancelReason?.startsWith("[CLAWBACK_PENDING]")) return // ja marcada

  const valorFmt = Number(monthly.amount).toFixed(2).replace(".", ",")
  await prisma.referralMonthlyCommission.update({
    where: { id: monthly.id },
    data: {
      cancelReason: `[CLAWBACK_PENDING] competencia ${period} (R$ ${valorFmt}) — ${reason}`,
      cancelledAt: new Date(),
    },
  })

  await createNotification({
    audience: "ROLE",
    roleTarget: "SUPER_ADMIN",
    level: "ERROR",
    title: `⚠️ Clawback de comissão mensal: ${monthly.referrer?.name ?? referred.referrerTenantId}`,
    body: `A mensalidade de ${referred.name} (competência ${period}) foi estornada, mas a comissão por faixas já estava ${monthly.status === "PAID" ? "paga" : "liberada"} (R$ ${valorFmt}). Os próximos payouts automáticos do indicador ficam BLOQUEADOS até resolver em /admin/indicacoes/comissoes.`,
    category: "referral",
    href: "/admin/indicacoes/comissoes",
  }).catch(() => {})
}
