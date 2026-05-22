import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { PageHeader } from "@/components/painel/page-header"
import { summaryForTenant } from "@/lib/referrals/commission"
import { ReferralPayoutForm } from "@/components/painel/referral-payout-form"
import { Card } from "@/components/ui/card"

export const dynamic = "force-dynamic"

function formatMoney(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n)
}

export default async function PainelIndicacoesSacarPage() {
  const session = await auth()
  const user = session?.user as
    | { id?: string; role?: string; tenantId?: string | null }
    | undefined
  if (!user?.id || user.role !== "RESELLER" || !user.tenantId) {
    redirect("/login?callbackUrl=/painel/indicacoes/sacar")
  }

  const [tenant, summary, settings, pending] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { pixKey: true, pixKeyType: true },
    }),
    summaryForTenant(user.tenantId),
    prisma.systemSettings.findUnique({
      where: { id: "default" },
      select: { referralMinPayout: true },
    }),
    prisma.referralPayout.findFirst({
      where: {
        referrerTenantId: user.tenantId,
        status: { in: ["REQUESTED", "PROCESSING"] },
      },
      select: { id: true, status: true, amount: true, requestedAt: true },
    }),
  ])

  const minPayout = Number(settings?.referralMinPayout ?? 50)

  return (
    <div className="space-y-6">
      <Link
        href="/painel/indicacoes"
        className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 hover:text-[var(--color-pmb-green-900)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar
      </Link>

      <PageHeader
        title="Solicitar saque"
        description="Escolha como deseja receber sua comissao."
      />

      <Card className="p-6 grid gap-2 sm:grid-cols-3">
        <div>
          <p className="text-xs uppercase text-gray-500">Disponivel</p>
          <p className="mt-1 text-xl font-bold text-[var(--color-pmb-green-900)]">
            {formatMoney(summary.available)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase text-gray-500">Pendente</p>
          <p className="mt-1 text-xl font-semibold text-gray-700">
            {formatMoney(summary.pending)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase text-gray-500">Minimo p/ saque</p>
          <p className="mt-1 text-xl font-semibold text-gray-700">
            {formatMoney(minPayout)}
          </p>
        </div>
      </Card>

      {pending ? (
        <Card className="p-6 border-amber-200 bg-amber-50">
          <p className="font-medium text-amber-900">
            Voce ja possui um saque em andamento de{" "}
            {formatMoney(Number(pending.amount))}.
          </p>
          <p className="text-sm text-amber-700 mt-1">
            Solicitado em{" "}
            {new Date(pending.requestedAt).toLocaleDateString("pt-BR")}.
            Aguarde a aprovacao para solicitar outro.
          </p>
        </Card>
      ) : summary.available < minPayout ? (
        <Card className="p-6 border-gray-200">
          <p className="text-sm text-gray-700">
            Voce precisa de pelo menos {formatMoney(minPayout)} disponiveis para
            solicitar um saque. Saldo atual: {formatMoney(summary.available)}.
          </p>
        </Card>
      ) : (
        <ReferralPayoutForm
          availableAmount={summary.available}
          minPayout={minPayout}
          initialPixKey={tenant?.pixKey ?? ""}
          initialPixKeyType={tenant?.pixKeyType ?? "CPF"}
        />
      )}
    </div>
  )
}
