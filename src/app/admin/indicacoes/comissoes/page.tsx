import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft, Download } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { PageHeader } from "@/components/painel/page-header"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
  const session = await requireAdminSession()
  if (!session) redirect("/login?callbackUrl=/admin/indicacoes/comissoes")
  if (session.role !== "SUPER_ADMIN" && session.role !== "PMB_RESELLER_MGR") {
    redirect("/admin")
  }

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

  const filters: Prisma.ReferralCommissionWhereInput = {}
  if (sp.referrer) filters.referrerTenantId = sp.referrer
  if (sp.referred) filters.referredTenantId = sp.referred
  if (sp.status && STATUS_OPTS.includes(sp.status as ReferralCommissionStatus)) {
    filters.status = sp.status as ReferralCommissionStatus
  }
  const days = sp.days ? Number(sp.days) : 90
  if (Number.isFinite(days) && days > 0) {
    const since = new Date()
    since.setDate(since.getDate() - days)
    filters.createdAt = { gte: since }
  }

  const commissions = await prisma.referralCommission.findMany({
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
  })

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
          title="Comissoes"
          description="Historico de comissoes geradas pelo programa de indicacao."
        />
        <a
          href={exportHref}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition hover:border-[var(--color-pmb-green)] hover:text-[var(--color-pmb-green-900)]"
        >
          <Download className="h-3.5 w-3.5" />
          Exportar CSV
        </a>
      </div>

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
          Periodo:
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
              <TableHead className="text-right">Comissao</TableHead>
              <TableHead>Liberacao</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {commissions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm text-gray-500 py-8">
                  Nenhuma comissao encontrada.
                </TableCell>
              </TableRow>
            ) : (
              commissions.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.createdAt.toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell className="font-medium">
                    <Link
                      href={`/admin/revendedores/${c.referrer.id}`}
                      className="hover:underline"
                    >
                      {c.referrer.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/revendedores/${c.referred.id}`}
                      className="hover:underline"
                    >
                      {c.referred.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatMoney(Number(c.baseAmount))}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {Number(c.percent).toFixed(2)}%
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {formatMoney(Number(c.amount))}
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
                      {c.status}
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
