import Link from "next/link"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { PageHeader } from "@/components/painel/page-header"
import { ensureReferralCode } from "@/lib/referrals/code"
import { summaryForTenant } from "@/lib/referrals/commission"
import { vitrineDomain } from "@/lib/tenant/urls"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ReferralLinkCopy } from "@/components/painel/referral-link-copy"

export const dynamic = "force-dynamic"

function formatMoney(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n)
}

function statusLabel(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "Ativo"
    case "PENDING":
      return "Aguardando 1o pagamento"
    case "SUSPENDED":
      return "Suspenso"
    case "CANCELLED":
      return "Cancelado"
    default:
      return status
  }
}

export default async function PainelIndicacoesPage() {
  const session = await auth()
  const user = session?.user as
    | { id?: string; role?: string; tenantId?: string | null }
    | undefined
  if (!user?.id || user.role !== "RESELLER" || !user.tenantId) {
    redirect("/login?callbackUrl=/painel/indicacoes")
  }

  // Garante referralCode (idempotente)
  const referralCode = await ensureReferralCode(user.tenantId)
  const tenant = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: { id: true, name: true, slug: true, pixKey: true, pixKeyType: true },
  })
  if (!tenant) redirect("/painel")

  const [summary, referrals] = await Promise.all([
    summaryForTenant(tenant.id),
    prisma.tenant.findMany({
      where: { referrerTenantId: tenant.id },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        createdAt: true,
        referralCommissionsGenerated: {
          where: { status: { in: ["PENDING", "AVAILABLE", "PAID"] } },
          select: { amount: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ])

  const baseUrl = `https://www.${vitrineDomain()}`
  const referralLink = `${baseUrl}/seja-revendedor?ref=${encodeURIComponent(referralCode)}`

  return (
    <div className="space-y-6">
      <PageHeader
        title="Indicacoes"
        description="Indique novos revendedores e ganhe comissoes recorrentes."
        actions={
          <Link
            href="/painel/indicacoes/materiais"
            className="text-sm font-medium text-[var(--color-pmb-green-900)] underline-offset-4 hover:underline"
          >
            Mensagens prontas
          </Link>
        }
      />

      <Card className="p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">
          Seu link de indicacao
        </h2>
        <ReferralLinkCopy link={referralLink} code={referralCode} />
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile label="Indicados ativos" value={String(summary.totalReferrals)} />
        <SummaryTile label="Pendente" value={formatMoney(summary.pending)} hint="Aguardando data de liberacao" />
        <SummaryTile
          label="Disponivel"
          value={formatMoney(summary.available)}
          hint="Pronto para saque"
          highlight
        />
        <SummaryTile label="Total pago" value={formatMoney(summary.paid)} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-[var(--color-pmb-green-900)]">
          Seus indicados ({referrals.length})
        </h2>
        {summary.available > 0 ? (
          <Link href="/painel/indicacoes/sacar">
            <Button>Solicitar saque</Button>
          </Link>
        ) : (
          <Button disabled title="Sem saldo disponivel para saque">
            Solicitar saque
          </Button>
        )}
      </div>

      {referrals.length === 0 ? (
        <Card className="p-8 text-center text-sm text-gray-500">
          Voce ainda nao tem indicados. Compartilhe seu link acima.
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Revendedor</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Indicado em</TableHead>
                <TableHead className="text-right">Total gerado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {referrals.map((r) => {
                const total = r.referralCommissionsGenerated.reduce(
                  (acc, c) => acc + Number(c.amount),
                  0,
                )
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-gray-500">{r.slug}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "ACTIVE" ? "default" : "secondary"}>
                        {statusLabel(r.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {r.createdAt.toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatMoney(total)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}

function SummaryTile({
  label,
  value,
  hint,
  highlight,
}: {
  label: string
  value: string
  hint?: string
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
      {hint ? <p className="mt-1 text-xs text-gray-500">{hint}</p> : null}
    </Card>
  )
}
