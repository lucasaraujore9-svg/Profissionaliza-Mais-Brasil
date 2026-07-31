import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { requireAdminPage } from "@/lib/auth/admin-guard"
import { PageHeader } from "@/components/painel/page-header"
import { AdminTrackingSettingsForm } from "@/components/admin/admin-tracking-settings-form"
import { readPmbPixels } from "@/lib/tracking/store"
import { WriteGate } from "@/components/shared/permissions/permission-context"

export const dynamic = "force-dynamic"

export default async function AdminTrackingSettingsPage() {
  await requireAdminPage("configuracoes.view")

  const pixels = await readPmbPixels()

  return (
    <WriteGate
      perm="configuracoes.manage"
      notice="Você está vendo os pixels em modo somente leitura. Para editá-los, peça a permissão “Editar as configurações do sistema”."
    >
      <div className="space-y-6">
        <Link
          href="/admin/configuracoes"
          className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 hover:text-[var(--color-pmb-green-900)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar para configurações
        </Link>

        <PageHeader
          title="Rastreamento (pixels)"
          description="Pixels de marketing e analytics do site PMB e das vitrines. GA4, Google Ads, GTM, Meta, TikTok, LinkedIn, Pinterest, Microsoft, Clarity e Hotjar."
        />

        <AdminTrackingSettingsForm initial={pixels} />
      </div>
    </WriteGate>
  )
}
