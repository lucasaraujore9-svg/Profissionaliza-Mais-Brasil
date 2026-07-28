import { redirect } from "next/navigation"
import { Suspense } from "react"
import { requirePainelPage } from "@/lib/auth/painel-guard"
import {
  allowedPainelTabs,
  canViewPainelTab,
  DEFAULT_PAINEL_TAB,
} from "@/lib/reports/painel/tabs"
import { PainelRelatoriosClient } from "@/components/painel/painel-relatorios-client"
import { ReportSkeleton } from "@/components/reports/states"

export const dynamic = "force-dynamic"

export default async function PainelRelatoriosTabPage({
  params,
}: {
  params: Promise<{ tab: string }>
}) {
  const ctx = await requirePainelPage("relatorios.view")

  const { tab } = await params
  // Gate server-side por permissão da aba — nunca confiar no client ter
  // escondido o botão. O dispatcher de BI repete a checagem.
  if (!canViewPainelTab(tab, ctx.can)) {
    redirect(`/painel/relatorios/${DEFAULT_PAINEL_TAB}`)
  }

  const tabs = allowedPainelTabs(ctx.can).map((t) => ({
    id: t.slug,
    label: t.label,
    icon: t.icon,
  }))

  return (
    <Suspense fallback={<ReportSkeleton />}>
      <PainelRelatoriosClient tabs={tabs} activeTab={tab} />
    </Suspense>
  )
}
