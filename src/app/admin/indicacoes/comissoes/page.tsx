import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft, Download } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { adminHome, requireAdminPage } from "@/lib/auth/admin-guard"
import { parseLinesSnapshot } from "@/lib/referrals/lines-snapshot"
import { referralCommissionStatusLabel } from "@/lib/labels"
import { PageHeader } from "@/components/painel/page-header"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ClawbackResolver } from "@/components/admin/clawback-resolver"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { Prisma, ReferralCommissionStatus } from "@prisma/client"

export const dynamic = "force-dynamic"

function formatMoney(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n)
}

const STATUS_OPTS: ReferralCommissionStatus[] = [
  "PENDING",
  "AVAILABLE",
  "PAID",
  "CANCELLED",
]

function formatPeriod(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period)
  return m ? `${m[2]}/${m[1]}` : period
}

/**
 * Descreve a taxa de uma comissao mensal na coluna "%". Prefere a quebra por
 * unidade (carrega o rate aplicado a cada uma) para detectar plano multi-fase;
 * rate de topo 0 e o sentinela desse caso quando nao ha linhas com rate.
 */
function describeTaxaMensal(m: {
  rateType: string
  rate: Prisma.Decimal
  linesSnapshot: Prisma.JsonValue | null
}): string {
  const withRate = parseLinesSnapshot(m.linesSnapshot).filter(
    (l): l is typeof l & { rate: number } => typeof l.rate === "number",
  )
  const first = withRate[0]
  if (first) {
    const distinct = new Set(withRate.map((l) => `${l.rateType ?? "?"}:${l.rate}`))
    if (distinct.size > 1) return "misto"
    return first.rateType === "PERCENT"
      ? `${first.rate.toFixed(2)}%`
      : `${formatMoney(first.rate)}/unid.`
  }
  const rate = Number(m.rate)
  if (!rate) return "misto"
  return m.rateType === "PERCENT"
    ? `${rate.toFixed(2)}%`
    : `${formatMoney(rate)}/unid.`
}

/**
 * Linha normalizada da tabela principal. Os dois ledgers (por pagamento e por
 * faixas/mensal) sao reduzidos a este formato para caber nas mesmas colunas.
 */
type LinhaComissao = {
  key: string
  createdAt: Date
  referrer: { id: string; name: string }
  /** So o ledger legado tem uma unidade indicada unica (com link). */
  indicado: { id: string; name: string } | null
  indicadoLabel: string
  indicadoDetalhe: string | null
  /** Competencia "MM/AAAA" — so existe no ledger mensal. */
  competencia: string | null
  base: number | null
  taxaLabel: string
  amount: number
  availableAt: Date
  status: ReferralCommissionStatus
}

export default async function AdminComissoesPage({
  searchParams,
}: {
  searchParams: Promise<{
    referrer?: string
    referred?: string
    status?: string
    days?: string
  }>
}) {
  const session = await requireAdminPage("indicacoes.view")

  const sp = await searchParams
  const exportParams = new URLSearchParams()
  if (sp.status && STATUS_OPTS.includes(sp.status as ReferralCommissionStatus)) {
    exportParams.set("status", sp.status)
  }
  if (sp.referrer) exportParams.set("referrerId", sp.referrer)
  if (sp.referred) exportParams.set("referredId", sp.referred)
  if (sp.days) exportParams.set("days", sp.days)
  const exportHref = `/api/admin/referrals/commissions/export${
    exportParams.toString() ? `?${exportParams.toString()}` : ""
  }`

  // Mesmo recorte do export irmao (/api/admin/referrals/commissions/export).
  const scope = await session.comissoesScope()
  if (!scope) redirect(adminHome(session))
  // Os dois ledgers tem `referrer` para Tenant, mas os WhereInput sao tipos
  // distintos — daí o filtro ser montado uma vez por ledger.
  const scopedReferrer = Object.keys(scope!).length > 0 ? scope! : null

  const filters: Prisma.ReferralCommissionWhereInput = scopedReferrer
    ? { referrer: scopedReferrer }
    : {}
  const monthlyFilters: Prisma.ReferralMonthlyCommissionWhereInput = scopedReferrer
    ? { referrer: scopedReferrer }
    : {}
  if (sp.referrer) {
    filters.referrerTenantId = sp.referrer
    monthlyFilters.referrerTenantId = sp.referrer
  }
  if (sp.referred) filters.referredTenantId = sp.referred
  if (sp.status && STATUS_OPTS.includes(sp.status as ReferralCommissionStatus)) {
    filters.status = sp.status as ReferralCommissionStatus
    monthlyFilters.status = sp.status as ReferralCommissionStatus
  }
  const days = sp.days ? Number(sp.days) : 90
  if (Number.isFinite(days) && days > 0) {
    const since = new Date()
    since.setDate(since.getDate() - days)
    filters.createdAt = { gte: since }
    monthlyFilters.createdAt = { gte: since }
  }

  const [legacyCommissions, monthlyRows] = await Promise.all([
    prisma.referralCommission.findMany({
      where: filters,
      select: {
        id: true,
        status: true,
        baseAmount: true,
        percent: true,
        amount: true,
        availableAt: true,
        paidAt: true,
        createdAt: true,
        cancelReason: true,
        referrer: { select: { id: true, name: true, slug: true } },
        referred: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.referralMonthlyCommission.findMany({
      where: monthlyFilters,
      select: {
        id: true,
        status: true,
        period: true,
        rateType: true,
        rate: true,
        unitCount: true,
        baseSum: true,
        amount: true,
        availableAt: true,
        createdAt: true,
        linesSnapshot: true,
        referrer: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  ])

  const legacyLinhas: LinhaComissao[] = legacyCommissions.map((c) => ({
    key: `legacy-${c.id}`,
    createdAt: c.createdAt,
    referrer: { id: c.referrer.id, name: c.referrer.name },
    indicado: { id: c.referred.id, name: c.referred.name },
    indicadoLabel: c.referred.name,
    indicadoDetalhe: null,
    competencia: null,
    base: Number(c.baseAmount),
    taxaLabel: `${Number(c.percent).toFixed(2)}%`,
    amount: Number(c.amount),
    availableAt: c.availableAt,
    status: c.status,
  }))

  const monthlyLinhas: LinhaComissao[] = monthlyRows
    // O ledger mensal nao tem referredTenantId: quando o filtro de indicada esta
    // ativo, a atribuicao so existe na quebra por unidade do snapshot.
    .filter((m) =>
      sp.referred
        ? parseLinesSnapshot(m.linesSnapshot).some(
            (l) => l.tenantId === sp.referred,
          )
        : true,
    )
    .map((m) => {
      const nomes = parseLinesSnapshot(m.linesSnapshot)
        .map((l) => l.name)
        .filter((n) => n !== "")
      const detalhe =
        nomes.length === 0
          ? null
          : nomes.length <= 3
            ? nomes.join(", ")
            : `${nomes.slice(0, 3).join(", ")} +${nomes.length - 3}`
      const base = Number(m.baseSum)
      return {
        key: `monthly-${m.id}`,
        createdAt: m.createdAt,
        referrer: { id: m.referrer.id, name: m.referrer.name },
        indicado: null,
        indicadoLabel: `${m.unitCount} unidade(s)`,
        indicadoDetalhe: detalhe,
        competencia: formatPeriod(m.period),
        // FIXED nao acumula base em dinheiro (baseSum = 0) — nao ha o que exibir.
        base: base > 0 ? base : null,
        taxaLabel: describeTaxaMensal(m),
        amount: Number(m.amount),
        availableAt: m.availableAt,
        status: m.status,
      }
    })

  const commissions: LinhaComissao[] = [...legacyLinhas, ...monthlyLinhas]
    .sort((a, b) => {
      const diff = b.createdAt.getTime() - a.createdAt.getTime()
      return diff !== 0 ? diff : a.key.localeCompare(b.key)
    })
    .slice(0, 500)

  // Clawbacks pendentes (estorno apos comissao liberada/paga) dos dois motores.
  // Mesma permissao do endpoint que resolve.
  const canResolve = session.can("indicacoes.clawback")
  const [legacyClawbacks, monthlyClawbacks] = await Promise.all([
    prisma.referralCommission.findMany({
      where: {
        cancelReason: { startsWith: "[CLAWBACK_PENDING]" },
        ...(scopedReferrer ? { referrer: scopedReferrer } : {}),
      },
      select: {
        id: true,
        amount: true,
        cancelReason: true,
        referrer: { select: { name: true } },
        referred: { select: { name: true } },
      },
      orderBy: { cancelledAt: "desc" },
      take: 100,
    }),
    prisma.referralMonthlyCommission.findMany({
      where: {
        cancelReason: { startsWith: "[CLAWBACK_PENDING]" },
        ...(scopedReferrer ? { referrer: scopedReferrer } : {}),
      },
      select: {
        id: true,
        amount: true,
        period: true,
        cancelReason: true,
        referrer: { select: { name: true } },
      },
      orderBy: { cancelledAt: "desc" },
      take: 100,
    }),
  ])
  const clawbackCount = legacyClawbacks.length + monthlyClawbacks.length

  return (
    <div className="space-y-6">
      <Link
        href="/admin/indicacoes"
        className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 hover:text-[var(--color-pmb-green-900)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Comissões"
          description="Histórico de comissões geradas pelo programa de indicação."
        />
        <a
          href={exportHref}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition hover:border-[var(--color-pmb-green)] hover:text-[var(--color-pmb-green-900)]"
        >
          <Download className="h-3.5 w-3.5" />
          Exportar CSV
        </a>
      </div>

      {clawbackCount > 0 ? (
        <Card className="overflow-hidden border-red-200">
          <div className="border-b border-red-100 bg-red-50 px-4 py-3">
            <h2 className="text-sm font-semibold text-red-800">
              Clawbacks pendentes ({clawbackCount})
            </h2>
            <p className="text-xs text-red-700">
              Mensalidades estornadas após a comissão já estar liberada/paga. Os
              payouts automáticos do indicador ficam bloqueados até resolver
              {canResolve ? "." : " (apenas SUPER_ADMIN/Financeiro resolvem)."}
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Indicador</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Motivo</TableHead>
                {canResolve ? <TableHead className="text-right">Ações</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {legacyClawbacks.map((c) => (
                <TableRow key={`legacy-${c.id}`}>
                  <TableCell className="font-medium">{c.referrer.name}</TableCell>
                  <TableCell className="text-xs text-gray-600">
                    Por pagamento · {c.referred.name}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatMoney(Number(c.amount))}
                  </TableCell>
                  <TableCell className="text-xs text-gray-600">
                    {c.cancelReason}
                  </TableCell>
                  {canResolve ? (
                    <TableCell className="text-right">
                      <ClawbackResolver ledger="LEGACY" id={c.id} />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
              {monthlyClawbacks.map((c) => (
                <TableRow key={`monthly-${c.id}`}>
                  <TableCell className="font-medium">{c.referrer.name}</TableCell>
                  <TableCell className="text-xs text-gray-600">
                    Por faixas · {c.period}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatMoney(Number(c.amount))}
                  </TableCell>
                  <TableCell className="text-xs text-gray-600">
                    {c.cancelReason}
                  </TableCell>
                  {canResolve ? (
                    <TableCell className="text-right">
                      <ClawbackResolver ledger="MONTHLY" id={c.id} />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : null}

      <form className="flex flex-wrap items-center gap-3 text-sm" method="get">
        <label className="flex items-center gap-2">
          Status:
          <select
            name="status"
            defaultValue={sp.status ?? ""}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="">Todos</option>
            {STATUS_OPTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          Período:
          <select
            name="days"
            defaultValue={sp.days ?? "90"}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="30">30 dias</option>
            <option value="90">90 dias</option>
            <option value="180">6 meses</option>
            <option value="365">1 ano</option>
          </select>
        </label>
        {sp.referrer ? <input type="hidden" name="referrer" value={sp.referrer} /> : null}
        {sp.referred ? <input type="hidden" name="referred" value={sp.referred} /> : null}
        <button
          type="submit"
          className="rounded-md bg-[var(--color-pmb-green-900)] text-white px-3 py-1 text-xs font-semibold"
        >
          Filtrar
        </button>
      </form>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Criada</TableHead>
              <TableHead>Indicador</TableHead>
              <TableHead>Indicado</TableHead>
              <TableHead className="text-right">Base</TableHead>
              <TableHead className="text-right">%</TableHead>
              <TableHead className="text-right">Comissão</TableHead>
              <TableHead>Liberação</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {commissions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm text-gray-500 py-8">
                  Nenhuma comissão encontrada.
                </TableCell>
              </TableRow>
            ) : (
              commissions.map((c) => (
                <TableRow key={c.key}>
                  <TableCell>
                    <div>{c.createdAt.toLocaleDateString("pt-BR")}</div>
                    {c.competencia ? (
                      <div className="text-xs text-gray-400">
                        Comp. {c.competencia}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link
                      href={`/admin/revendedores/${c.referrer.id}`}
                      className="hover:underline"
                    >
                      {c.referrer.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {c.indicado ? (
                      <Link
                        href={`/admin/revendedores/${c.indicado.id}`}
                        className="hover:underline"
                      >
                        {c.indicado.name}
                      </Link>
                    ) : (
                      <>
                        <div>{c.indicadoLabel}</div>
                        {c.indicadoDetalhe ? (
                          <div className="text-xs text-gray-400">
                            {c.indicadoDetalhe}
                          </div>
                        ) : null}
                      </>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {c.base === null ? "—" : formatMoney(c.base)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {c.taxaLabel}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {formatMoney(c.amount)}
                  </TableCell>
                  <TableCell>
                    {c.availableAt.toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        c.status === "PAID"
                          ? "default"
                          : c.status === "AVAILABLE"
                            ? "default"
                            : c.status === "CANCELLED"
                              ? "destructive"
                              : "secondary"
                      }
                    >
                      {referralCommissionStatusLabel(c.status)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
