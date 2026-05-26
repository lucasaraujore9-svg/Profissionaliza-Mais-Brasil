import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { PageHeader } from "@/components/painel/page-header"
import { AdminTecnicaSettingsForm } from "@/components/admin/admin-tecnica-settings-form"

export const dynamic = "force-dynamic"

export default async function AdminTecnicaSettingsPage() {
  const session = await requireAdminSession()
  if (!session) redirect("/login?callbackUrl=/admin/configuracoes/unidade-tecnica")
  if (session.role !== "SUPER_ADMIN") redirect("/admin/configuracoes")

  const settings = await prisma.systemSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
    select: {
      tecnicaEnabled: true,
      tecnicaUrl: true,
      tecnicaLabel: true,
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
        title="Unidade Técnica — site PMB"
        description="Habilita a categoria, item de menu e seção “Cursos Técnicos” no site institucional profissionalizamaisbrasil.com.br. Para vitrines de revendedor, configure individualmente em cada revendedor."
      />

      <AdminTecnicaSettingsForm
        initial={{
          enabled: settings.tecnicaEnabled,
          url: settings.tecnicaUrl,
          label: settings.tecnicaLabel,
        }}
      />
    </div>
  )
}
