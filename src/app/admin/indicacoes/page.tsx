import Link from "next/link"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
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
  const session = await requireAdminSession()
  if (!session) redirect("/login?callbackUrl=/admin/indicacoes")
  if (
    session.role !== "SUPER_ADMIN" &&
    session.role !== "PMB_RESELLER_MGR" &&
    session.role !== "PMB_FINANCEIRO"
  ) {
    redirect("/admin")
  }

  const [referrers, totals] = await Promise.all([
    prisma.tenant.findMany({
      where: {
        referrals: { some: {} },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        _count: { select: { referrals: true } },
        referralCommissionsReceived: {
          select: { amount: true, status: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.referralCommission.groupBy({
      by: ["status"],
      _sum: { amount: true },
    }),
  ])

  const totalsMap: Record<string, number> = {
    PENDING: 0,
    AVAILABLE: 0,
    PAID: 0,
    CANCELLED: 0,
  }
  for (const t of totals) {
    totalsMap[t.status] = Number(t._sum.amount ?? 0)
  }

  const items = referrers
    .map((r) => {
      const totals = {
        PENDING: 0,
        AVAILABLE: 0,
        PAID: 0,
      }
      for (const c of r.referralCommissionsReceived) {
        if (c.status === "PENDING" || c.status === "AVAILABLE" || c.status === "PAID") {
          totals[c.status] += Number(c.amount)
        }
      }
      return {
        id: r.id,
        name: r.name,
        slug: r.slug,
        referralsCount: r._count.referrals,
        ...totals,
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
        <SummaryTile label="Pago" value={formatMoney(totalsMap.PAID)} />
        <SummaryTile label="Cancelado" value={formatMoney(totalsMap.CANCELLED)} />
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Indicador</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead className="text-right">Qtd indicados</TableHead>
              <TableHead className="text-right">Pendente</TableHead>
              <TableHead className="text-right">Disponível</TableHead>
              <TableHead className="text-right">Pago</TableHead>
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
                  <TableCell className="text-right">{r.referralsCount}</TableCell>
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
