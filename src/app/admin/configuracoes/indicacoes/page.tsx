import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { PageHeader } from "@/components/painel/page-header"
import { AdminReferralSettingsForm } from "@/components/admin/admin-referral-settings-form"
import { parseBrackets } from "@/lib/referrals/rules"

export const dynamic = "force-dynamic"

export default async function AdminReferralSettingsPage() {
  const session = await requireAdminSession()
  if (!session) redirect("/login?callbackUrl=/admin/configuracoes/indicacoes")
  if (session.role !== "SUPER_ADMIN") redirect("/admin/configuracoes")

  const settings = await prisma.systemSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
    select: {
      referralEnabled: true,
      defaultReferralPercent: true,
      referralMinPayout: true,
      referralPayoutDay: true,
      commissionMode: true,
      commissionBracketBasis: true,
      commissionRateType: true,
      commissionPayoutBase: true,
      commissionBrackets: true,
    },
  })

  return (
    <div className="space-y-6">
      <Link
        href="/admin/configuracoes"
        className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 hover:text-[var(--color-pmb-green-900)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar para configurações
      </Link>

      <PageHeader
        title="Configurações do programa de indicação"
        description="Defina o percentual padrão, valor mínimo de saque e o dia do mês em que comissões ficam disponíveis."
      />

      <AdminReferralSettingsForm
        initial={{
          referralEnabled: settings.referralEnabled,
          defaultReferralPercent: Number(settings.defaultReferralPercent),
          referralMinPayout: Number(settings.referralMinPayout),
          referralPayoutDay: settings.referralPayoutDay,
          commissionMode: settings.commissionMode,
          commissionBracketBasis: settings.commissionBracketBasis,
          commissionRateType: settings.commissionRateType,
          commissionPayoutBase: settings.commissionPayoutBase,
          commissionBrackets: parseBrackets(settings.commissionBrackets),
        }}
      />
    </div>
  )
}
