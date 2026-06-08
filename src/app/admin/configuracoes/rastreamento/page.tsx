import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { PageHeader } from "@/components/painel/page-header"
import { AdminTrackingSettingsForm } from "@/components/admin/admin-tracking-settings-form"
import { readPmbPixels } from "@/lib/tracking/store"

export const dynamic = "force-dynamic"

export default async function AdminTrackingSettingsPage() {
  const session = await requireAdminSession()
  if (!session) redirect("/login?callbackUrl=/admin/configuracoes/rastreamento")
  if (session.role !== "SUPER_ADMIN") redirect("/admin/configuracoes")

  const pixels = await readPmbPixels()

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
        title="Rastreamento (pixels)"
        description="Pixels de marketing e analytics do site PMB e das vitrines. GA4, Google Ads, GTM, Meta, TikTok, LinkedIn, Pinterest, Microsoft, Clarity e Hotjar."
      />

      <AdminTrackingSettingsForm initial={pixels} />
    </div>
  )
}
