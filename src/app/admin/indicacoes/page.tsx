import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { requireAdminPage } from "@/lib/auth/admin-guard"
import { PageHeader } from "@/components/painel/page-header"
import { Card } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export const dynamic = "force-dynamic"

function formatMoney(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n)
}

export default async function AdminIndicacoesPage() {
  await requireAdminPage("indicacoes.view")

  const [referrers, totals, monthlyTotals, payoutsPaidByReferrer] = await Promise.all([
    prisma.tenant.findMany({
      where: {
        referrals: { some: {} },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        // Status de cada indicada — para separar "ativos" do total (antes o
        // _count somava qualquer status, mas era exibido como indicados).
        referrals: { select: { status: true } },
        referralCommissionsReceived: {
          select: { amount: true, status: true },
        },
        // Motor por faixas (MONTHLY_TIERED) — sem isto, indicadores no modo
        // mensal apareciam zerados aqui (o painel já soma os dois).
        referralMonthlyCommissions: {
          select: { amount: true, status: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.referralCommission.groupBy({
      by: ["status"],
      _sum: { amount: true },
    }),
    prisma.referralMonthlyCommission.groupBy({
      by: ["status"],
      _sum: { amount: true },
    }),
    // "Pago" e CAIXA, nao apuracao: sai de ReferralPayout PAID. O financeiro
    // pode ajustar o valor ao liquidar o saque e esse ajuste vive so no payout,
    // entao somar comissoes PAID mostraria menos do que saiu do caixa.
    prisma.referralPayout.groupBy({
      by: ["referrerTenantId"],
      where: { status: "PAID" },
      _sum: { amount: true },
    }),
  ])

  const totalsMap: Record<string, number> = {
    PENDING: 0,
    AVAILABLE: 0,
    CANCELLED: 0,
  }
  for (const t of totals) {
    if (t.status === "PAID") continue
    totalsMap[t.status] += Number(t._sum.amount ?? 0)
  }
  for (const t of monthlyTotals) {
    if (t.status === "PAID") continue
    totalsMap[t.status] += Number(t._sum.amount ?? 0)
  }

  const paidByReferrer = new Map(
    payoutsPaidByReferrer.map((p) => [p.referrerTenantId, Number(p._sum.amount ?? 0)]),
  )
  const paidTotal = [...paidByReferrer.values()].reduce((a, b) => a + b, 0)

  const items = referrers
    .map((r) => {
      const totals = {
        PENDING: 0,
        AVAILABLE: 0,
      }
      for (const c of r.referralCommissionsReceived) {
        if (c.status === "PENDING" || c.status === "AVAILABLE") {
          totals[c.status] += Number(c.amount)
        }
      }
      for (const c of r.referralMonthlyCommissions) {
        if (c.status === "PENDING" || c.status === "AVAILABLE") {
          totals[c.status] += Number(c.amount)
        }
      }
      return {
        id: r.id,
        name: r.name,
        slug: r.slug,
        referralsCount: r.referrals.length,
        activeReferralsCount: r.referrals.filter((x) => x.status === "ACTIVE")
          .length,
        ...totals,
        PAID: paidByReferrer.get(r.id) ?? 0,
      }
    })
    .sort((a, b) => b.PAID + b.AVAILABLE + b.PENDING - (a.PAID + a.AVAILABLE + a.PENDING))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Indicações"
        description="Visão global do programa de indicação 1-nível."
        actions={
          <div className="flex gap-2 text-sm">
            <Link
              href="/admin/indicacoes/comissoes"
              className="font-medium text-[var(--color-pmb-green-900)] underline-offset-4 hover:underline"
            >
              Comissões
            </Link>
            <Link
              href="/admin/indicacoes/saques"
              className="font-medium text-[var(--color-pmb-green-900)] underline-offset-4 hover:underline"
            >
              Pagamentos
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile label="Pendente" value={formatMoney(totalsMap.PENDING)} />
        <SummaryTile label="Disponível" value={formatMoney(totalsMap.AVAILABLE)} highlight />
        <SummaryTile label="Pago (saques)" value={formatMoney(paidTotal)} />
        <SummaryTile label="Cancelado" value={formatMoney(totalsMap.CANCELLED)} />
      </div>

      <p className="-mt-2 text-xs text-gray-500">
        Pendente, Disponível e Cancelado são valores <strong>apurados</strong> pelo
        motor de comissão. Pago é <strong>caixa</strong>: a soma dos saques
        liquidados — pode divergir da apuração quando o financeiro ajusta o valor
        no momento do pagamento.
      </p>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Indicador</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead className="text-right">Indicados ativos</TableHead>
              <TableHead className="text-right">Pendente</TableHead>
              <TableHead className="text-right">Disponível</TableHead>
              <TableHead className="text-right">Pago (saques)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-gray-500 py-8">
                  Nenhum revendedor com indicações ainda.
                </TableCell>
              </TableRow>
            ) : (
              items.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/admin/revendedores/${r.id}`}
                      className="hover:underline"
                    >
                      {r.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-gray-500">{r.slug}</TableCell>
                  <TableCell className="text-right">
                    {r.activeReferralsCount}
                    {r.referralsCount > r.activeReferralsCount ? (
                      <span className="text-gray-400"> / {r.referralsCount}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatMoney(r.PENDING)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[var(--color-pmb-green-900)]">
                    {formatMoney(r.AVAILABLE)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatMoney(r.PAID)}
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

function SummaryTile({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <Card
      className={`p-5 ${highlight ? "border-[var(--color-pmb-green-900)] bg-[var(--color-pmb-green-900)]/5" : ""}`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-[var(--color-pmb-green-900)]">
        {value}
      </p>
    </Card>
  )
}
