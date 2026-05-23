import Link from "next/link"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { PageHeader } from "@/components/painel/page-header"
import { ensureReferralCode } from "@/lib/referrals/code"
import { summaryForTenant } from "@/lib/referrals/commission"
import { vitrineDomain } from "@/lib/tenant/urls"
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
import { ReferralLinkCopy } from "@/components/painel/referral-link-copy"

export const dynamic = "force-dynamic"

function formatMoney(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n)
}

function buildDemoMonthOptions(
  count: number,
): Array<{ value: string; label: string }> {
  const labelMonths = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ]
  const out: Array<{ value: string; label: string }> = []
  const now = new Date()
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const y = d.getFullYear()
    const mIdx = d.getMonth()
    const mStr = String(mIdx + 1).padStart(2, "0")
    out.push({ value: `${y}-${mStr}`, label: `${labelMonths[mIdx]}/${y}` })
  }
  return out
}

function statusLabel(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "Ativo"
    case "PENDING":
      return "Aguardando 1º pagamento"
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

  // Calcula proxima data de pagamento (dia X do mes seguinte, default 20)
  const settings = await prisma.systemSettings.findUnique({
    where: { id: "default" },
    select: { referralPayoutDay: true },
  })
  const payoutDay = settings?.referralPayoutDay ?? 20
  const today = new Date()
  const nextPayout = new Date(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    payoutDay,
  )
  // Se o dia X deste mes ja passou, vai pro mes seguinte
  if (nextPayout <= today) {
    nextPayout.setUTCMonth(nextPayout.getUTCMonth() + 1)
  }
  const nextPayoutLabel = nextPayout.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })

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

  // Opcoes de mes (ultimos 12) para o demonstrativo PDF.
  const demoMonthOptions = buildDemoMonthOptions(12)
  const defaultDemoMonth = demoMonthOptions[0]?.value ?? ""

  return (
    <div className="space-y-6">
      <PageHeader
        title="Indicações"
        description="Indique novos revendedores e ganhe comissões recorrentes."
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
          Seu link de indicação
        </h2>
        <ReferralLinkCopy link={referralLink} code={referralCode} />
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile label="Indicados ativos" value={String(summary.totalReferrals)} />
        <SummaryTile label="Pendente" value={formatMoney(summary.pending)} hint="Aguarda data de liberação" />
        <SummaryTile
          label="A receber"
          value={formatMoney(summary.available)}
          hint={`Pagamento dia ${payoutDay}`}
          highlight
        />
        <SummaryTile label="Total pago" value={formatMoney(summary.paid)} />
      </div>

      <Card className="border-[var(--color-pmb-green-900)]/20 bg-[var(--color-pmb-green-900)]/5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
              Pagamento automático
            </p>
            <p className="mt-1 text-sm text-gray-700">
              Você não precisa solicitar saque. As comissões são pagas
              automaticamente todo dia {payoutDay} do mês seguinte ao pagamento
              do indicado.
            </p>
            <p className="mt-2 text-xs text-gray-600">
              Próximo pagamento: <strong>{nextPayoutLabel}</strong>
            </p>
          </div>
          {!tenant.pixKey ? (
            <Link
              href="/painel/configuracoes"
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--color-pmb-green-700)]"
            >
              Cadastrar PIX
            </Link>
          ) : (
            <div className="text-xs text-gray-600">
              PIX cadastrado: <span className="font-mono">{tenant.pixKeyType}</span>
            </div>
          )}
        </div>

        {/* Demonstrativo mensal em PDF */}
        <div className="mt-5 border-t border-[var(--color-pmb-green-900)]/15 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-pmb-green-900)]">
            Demonstrativo mensal (PDF)
          </p>
          <p className="mt-1 text-xs text-gray-600">
            Recibo das comissões pagas no mês selecionado.
          </p>
          <form
            method="get"
            action="/api/painel/indicacoes/demonstrativo"
            className="mt-3 flex flex-wrap items-center gap-2"
          >
            <label htmlFor="demo-month" className="sr-only">
              Mês de referência
            </label>
            <select
              id="demo-month"
              name="month"
              defaultValue={defaultDemoMonth}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-green)]"
            >
              {demoMonthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-pmb-green)] bg-white px-3 py-2 text-sm font-semibold text-[var(--color-pmb-green-900)] hover:bg-[var(--color-pmb-lime-50)]/40"
            >
              Baixar demonstrativo
            </button>
          </form>
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-[var(--color-pmb-green-900)]">
          Seus indicados ({referrals.length})
        </h2>
      </div>

      {referrals.length === 0 ? (
        <Card className="p-8 text-center text-sm text-gray-500">
          Você ainda não tem indicados. Compartilhe seu link acima.
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
