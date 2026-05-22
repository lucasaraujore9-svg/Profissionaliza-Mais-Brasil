import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { PageHeader } from "@/components/painel/page-header"
import { AdminReferralSettingsForm } from "@/components/admin/admin-referral-settings-form"

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
    },
  })

  return (
    <div className="space-y-6">
      <Link
        href="/admin/configuracoes"
        className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 hover:text-[var(--color-pmb-green-900)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar para configuracoes
      </Link>

      <PageHeader
        title="Configuracoes do programa de indicacao"
        description="Defina o percentual padrao, valor minimo de saque e o dia do mes em que comissoes ficam disponiveis."
      />

      <AdminReferralSettingsForm
        initial={{
          referralEnabled: settings.referralEnabled,
          defaultReferralPercent: Number(settings.defaultReferralPercent),
          referralMinPayout: Number(settings.referralMinPayout),
          referralPayoutDay: settings.referralPayoutDay,
        }}
      />
    </div>
  )
}
