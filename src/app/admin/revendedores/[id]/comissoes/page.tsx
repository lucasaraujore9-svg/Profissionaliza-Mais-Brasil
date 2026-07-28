import { notFound } from "next/navigation"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  describeEffectiveCommission,
  resolveEffectiveCommission,
} from "@/lib/referrals/effective-rule"
import { requireAdminPage } from "@/lib/auth/admin-guard"
import { PageHeader } from "@/components/painel/page-header"
import { ResellerBackLink } from "@/components/admin/reseller-back-link"
import {
  ResellerCommissionsTabs,
  type CommissionRow,
} from "@/components/admin/reseller-commissions-tabs"
import { parseLinesSnapshot } from "@/lib/referrals/lines-snapshot"
import { ResellerCommissionOverrideForm } from "@/components/admin/reseller-commission-override-form"

export const dynamic = "force-dynamic"

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

// Ledger do motor por faixas (mensal). Uma linha por (indicador, competencia).
const monthlySelect = {
  id: true,
  period: true,
  rateType: true,
  rate: true,
  unitCount: true,
  baseSum: true,
  amount: true,
  linesSnapshot: true,
  status: true,
  availableAt: true,
  paidAt: true,
  cancelledAt: true,
  cancelReason: true,
  createdAt: true,
  payoutId: true,
  referrer: { select: { id: true, name: true, slug: true } },
  payout: { select: { id: true, status: true, paidAt: true } },
} satisfies Prisma.ReferralMonthlyCommissionSelect

type MonthlyRaw = Prisma.ReferralMonthlyCommissionGetPayload<{
  select: typeof monthlySelect
}>

/**
 * Taxa da faixa aplicada no mes: % (PERCENT) ou R$ por unidade (FIXED).
 * Plano em fases mistas grava rate 0 no topo — a quebra real fica nas linhas.
 */
function describeFaixa(m: MonthlyRaw): string {
  const rate = Number(m.rate)
  if (rate === 0) return "misto"
  return m.rateType === "PERCENT"
    ? `${rate.toFixed(2)}%/unid.`
    : `${BRL.format(rate)}/unid.`
}

/** "AAAA-MM" -> dia 1 ao meio-dia UTC (nao vira o mes no fuso BR). */
function periodToDueDate(period: string, fallback: Date): string {
  if (!/^\d{4}-\d{2}$/.test(period)) return fallback.toISOString()
  return new Date(`${period}-01T12:00:00.000Z`).toISOString()
}

/**
 * Comissoes mensais RECEBIDAS pelo indicador. Nao existe TenantPayment nem
 * unidade indicada unica: a competencia vem de `period` e a coluna do indicado
 * vira a contagem de unidades do mes (a taxa da faixa vai na linha de baixo,
 * porque a coluna "%" so aceita numero e nao cabe FIXED/misto).
 */
function serializeMonthlyReceived(rows: MonthlyRaw[]): CommissionRow[] {
  return rows.map((m) => ({
    id: `monthly-${m.id}`,
    status: m.status,
    baseAmount: Number(m.baseSum),
    percent: m.rateType === "PERCENT" ? Number(m.rate) : 0,
    amount: Number(m.amount),
    availableAt: m.availableAt.toISOString(),
    paidAt: m.paidAt ? m.paidAt.toISOString() : null,
    cancelledAt: m.cancelledAt ? m.cancelledAt.toISOString() : null,
    cancelReason: m.cancelReason ?? null,
    createdAt: m.createdAt.toISOString(),
    payoutId: m.payoutId ?? null,
    referrer: m.referrer,
    referred: {
      // Sem unidade unica: o link volta para o proprio indicador.
      id: m.referrer.id,
      name: `${m.unitCount} unidade(s)`,
      slug: `mensal · ${describeFaixa(m)}`,
    },
    tenantPayment: {
      id: m.id,
      dueDate: periodToDueDate(m.period, m.createdAt),
      paidAt: null,
      amount: Number(m.baseSum),
      status: "-",
    },
    payout: m.payout
      ? {
          id: m.payout.id,
          status: m.payout.status,
          paidAt: m.payout.paidAt ? m.payout.paidAt.toISOString() : null,
        }
      : null,
  }))
}

/**
 * Comissoes mensais GERADAS por esta unidade: a contribuicao dela dentro da
 * comissao do indicador, lida da linha correspondente em `linesSnapshot`.
 * Meses em que a unidade nao entrou no calculo nao viram linha.
 */
function serializeMonthlyGenerated(
  rows: MonthlyRaw[],
  referred: { id: string; name: string; slug: string },
): CommissionRow[] {
  const out: CommissionRow[] = []
  for (const m of rows) {
    const line = parseLinesSnapshot(m.linesSnapshot).find(
      (l) => l.tenantId === referred.id,
    )
    if (!line) continue
    const isPercent = (line.rateType ?? m.rateType) === "PERCENT"
    out.push({
      id: `monthly-${m.id}`,
      status: m.status,
      baseAmount: line.mensalidade,
      // Em FIXED o proprio valor da comissao ja e o R$ por unidade da faixa.
      percent: isPercent && line.rate != null ? line.rate : 0,
      amount: line.amount,
      availableAt: m.availableAt.toISOString(),
      paidAt: m.paidAt ? m.paidAt.toISOString() : null,
      cancelledAt: m.cancelledAt ? m.cancelledAt.toISOString() : null,
      cancelReason: m.cancelReason ?? null,
      createdAt: m.createdAt.toISOString(),
      payoutId: m.payoutId ?? null,
      referrer: m.referrer,
      referred,
      tenantPayment: {
        id: m.id,
        dueDate: periodToDueDate(m.period, m.createdAt),
        paidAt: null,
        amount: line.mensalidade,
        status: "-",
      },
      payout: m.payout
        ? {
            id: m.payout.id,
            status: m.payout.status,
            paidAt: m.payout.paidAt ? m.payout.paidAt.toISOString() : null,
          }
        : null,
    })
  }
  return out
}

/** Une os dois ledgers numa lista so, mais recentes primeiro. */
function mergeRows(legacy: CommissionRow[], monthly: CommissionRow[]): CommissionRow[] {
  return [...legacy, ...monthly]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, 500)
}

export default async function ResellerCommissionsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ctx = await requireAdminPage("unidades.comissoes")

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      accountManagerId: true,
      salesUserId: true,
      referrerTenantId: true,
      referralMinReferrals: true,
      commissionBracketBasis: true,
      commissionRateType: true,
      commissionPayoutBase: true,
      commissionBrackets: true,
      commissionPlan: true,
      commissionOverrideSource: true,
    },
  })
  // Mesmo recorte das APIs irmãs (export e demonstrativo): a permissão diz QUEM
  // vê comissões, a carteira diz de QUAIS unidades. Sem isto a página abria o
  // ledger completo de qualquer unidade por id — 404 (e não 403) para não
  // revelar a existência de unidades fora do escopo.
  if (!tenant || !(await ctx.canAccessTenant(tenant))) notFound()

  // Regra que ESTA VALENDO, resolvida pelo mesmo `resolveEffectiveCommission`
  // que o fechamento mensal usa — a tela nao pode divergir do que o sistema paga.
  const settings = await prisma.systemSettings.findUnique({
    where: { id: "default" },
    select: {
      commissionMode: true,
      commissionBracketBasis: true,
      commissionRateType: true,
      commissionPayoutBase: true,
      commissionBrackets: true,
      commissionPlan: true,
      defaultReferralPercent: true,
      defaultReferralMinReferrals: true,
    },
  })
  const effectiveRule = resolveEffectiveCommission(tenant, settings)

  const [
    legacyReceivedRaw,
    legacyGeneratedRaw,
    monthlyReceivedRaw,
    monthlyGeneratedRaw,
  ] = await Promise.all([
    prisma.referralCommission.findMany({
      where: { referrerTenantId: id },
      select: {
        id: true,
        status: true,
        baseAmount: true,
        percent: true,
        amount: true,
        availableAt: true,
        paidAt: true,
        cancelledAt: true,
        cancelReason: true,
        createdAt: true,
        payoutId: true,
        referrer: { select: { id: true, name: true, slug: true } },
        referred: { select: { id: true, name: true, slug: true } },
        tenantPayment: {
          select: { id: true, dueDate: true, paidAt: true, amount: true, status: true },
        },
        payout: { select: { id: true, status: true, paidAt: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.referralCommission.findMany({
      where: { referredTenantId: id },
      select: {
        id: true,
        status: true,
        baseAmount: true,
        percent: true,
        amount: true,
        availableAt: true,
        paidAt: true,
        cancelledAt: true,
        cancelReason: true,
        createdAt: true,
        payoutId: true,
        referrer: { select: { id: true, name: true, slug: true } },
        referred: { select: { id: true, name: true, slug: true } },
        tenantPayment: {
          select: { id: true, dueDate: true, paidAt: true, amount: true, status: true },
        },
        payout: { select: { id: true, status: true, paidAt: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    // Motor mensal (faixas): mesmo criterio das listas legadas (sem filtro de
    // status/periodo), so que o ledger nao tem referredTenantId.
    prisma.referralMonthlyCommission.findMany({
      where: { referrerTenantId: id },
      select: monthlySelect,
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    // Geradas: as comissoes mensais do indicador desta unidade — a participacao
    // dela sai de linesSnapshot na serializacao.
    tenant.referrerTenantId
      ? prisma.referralMonthlyCommission.findMany({
          where: { referrerTenantId: tenant.referrerTenantId },
          select: monthlySelect,
          orderBy: { createdAt: "desc" },
          take: 500,
        })
      : Promise.resolve<MonthlyRaw[]>([]),
  ])

  function serialize(rows: typeof legacyReceivedRaw): CommissionRow[] {
    return rows.map((c) => ({
      id: c.id,
      status: c.status,
      baseAmount: Number(c.baseAmount),
      percent: Number(c.percent),
      amount: Number(c.amount),
      availableAt: c.availableAt.toISOString(),
      paidAt: c.paidAt ? c.paidAt.toISOString() : null,
      cancelledAt: c.cancelledAt ? c.cancelledAt.toISOString() : null,
      cancelReason: c.cancelReason ?? null,
      createdAt: c.createdAt.toISOString(),
      payoutId: c.payoutId ?? null,
      referrer: c.referrer,
      referred: c.referred,
      tenantPayment: {
        id: c.tenantPayment.id,
        dueDate: c.tenantPayment.dueDate.toISOString(),
        paidAt: c.tenantPayment.paidAt
          ? c.tenantPayment.paidAt.toISOString()
          : null,
        amount: Number(c.tenantPayment.amount),
        status: c.tenantPayment.status,
      },
      payout: c.payout
        ? {
            id: c.payout.id,
            status: c.payout.status,
            paidAt: c.payout.paidAt ? c.payout.paidAt.toISOString() : null,
          }
        : null,
    }))
  }

  const received = mergeRows(
    serialize(legacyReceivedRaw),
    serializeMonthlyReceived(monthlyReceivedRaw),
  )
  const generated = mergeRows(
    serialize(legacyGeneratedRaw),
    serializeMonthlyGenerated(monthlyGeneratedRaw, {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
    }),
  )

  return (
    <div className="space-y-6">
      <ResellerBackLink
        href={`/admin/revendedores/${id}`}
        label="Voltar para revendedor"
      />
      <PageHeader
        title={`Comissões - ${tenant.name}`}
        description={`Detalhamento de comissões recebidas e geradas por ${tenant.slug}.`}
      />
      <ResellerCommissionOverrideForm
        tenantId={id}
        initial={{
          overrideSource:
            (tenant.commissionOverrideSource as "MANUAL" | "FROZEN" | null) ?? null,
          commissionBracketBasis: tenant.commissionBracketBasis,
          commissionRateType: tenant.commissionRateType,
          commissionPayoutBase: tenant.commissionPayoutBase,
          commissionBrackets: tenant.commissionBrackets,
          commissionPlan: tenant.commissionPlan,
          referralMinReferrals: tenant.referralMinReferrals,
          defaultMinReferrals: settings?.defaultReferralMinReferrals ?? 3,
        }}
        preview={{
          description: describeEffectiveCommission(effectiveRule),
          warnings: effectiveRule.warnings,
        }}
      />
      <ResellerCommissionsTabs
        tenantId={id}
        hasReferrer={tenant.referrerTenantId != null}
        received={received}
        generated={generated}
      />
    </div>
  )
}
