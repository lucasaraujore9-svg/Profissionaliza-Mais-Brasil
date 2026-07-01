import { redirect } from "next/navigation"
import { Suspense } from "react"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { allowedTabs, canViewTab, defaultTab } from "@/lib/reports/tabs"
import { AdminRelatoriosClient } from "@/components/admin/admin-relatorios-client"
import { ReportSkeleton } from "@/components/reports/states"

export const dynamic = "force-dynamic"

export default async function AdminRelatoriosTabPage({
  params,
}: {
  params: Promise<{ tab: string }>
}) {
  const session = await requireAdminSession()
  if (!session) redirect("/login?callbackUrl=/admin/relatorios")

  const { tab } = await params
  // Gate server-side por aba: redireciona para a aba padrão do papel se a URL
  // apontar para uma aba que ele não pode ver.
  if (!canViewTab(session.role, tab)) {
    redirect(`/admin/relatorios/${defaultTab(session.role)}`)
  }

  const tabs = allowedTabs(session.role).map((t) => ({
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
