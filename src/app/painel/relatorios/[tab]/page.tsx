import { redirect } from "next/navigation"
import { Suspense } from "react"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
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
  const ctx = await requireResellerSession()
  if (!ctx) redirect("/login?callbackUrl=/painel/relatorios")

  // Owner direto = User.tenantId aponta para a unidade (consultores têm null).
  const owner = await prisma.user.findFirst({
    where: { id: ctx.userId, tenantId: ctx.tenantId },
    select: { id: true },
  })
  const isOwner = !!owner

  const { tab } = await params
  // Gate server-side: consultor não acessa aba owner-only.
  if (!canViewPainelTab(tab, isOwner)) {
    redirect(`/painel/relatorios/${DEFAULT_PAINEL_TAB}`)
  }

  const tabs = allowedPainelTabs(isOwner).map((t) => ({
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
