import { redirect } from "next/navigation"
import { Suspense } from "react"
import { adminHome, requireAdminPage } from "@/lib/auth/admin-guard"
import { allowedTabs, canViewTab, defaultTab } from "@/lib/reports/tabs"
import { AdminRelatoriosClient } from "@/components/admin/admin-relatorios-client"
import { ReportSkeleton } from "@/components/reports/states"

export const dynamic = "force-dynamic"

export default async function AdminRelatoriosTabPage({
  params,
}: {
  params: Promise<{ tab: string }>
}) {
  const session = await requireAdminPage("relatorios.view")

  const { tab } = await params
  // Gate server-side por aba: redireciona para a aba de entrada da pessoa se a
  // URL apontar para uma aba que ela não pode ver. Sem nenhuma aba permitida
  // (todas revogadas), sai do hub em vez de entrar em loop de redirect.
  if (!canViewTab(session.permissions, tab)) {
    const fallback = defaultTab(session.role, session.permissions)
    redirect(fallback ? `/admin/relatorios/${fallback}` : adminHome(session))
  }

  const tabs = allowedTabs(session.permissions).map((t) => ({
    id: t.slug,
    label: t.label,
    icon: t.icon,
  }))

  return (
    <Suspense fallback={<ReportSkeleton />}>
      <AdminRelatoriosClient tabs={tabs} activeTab={tab} />
    </Suspense>
  )
}
