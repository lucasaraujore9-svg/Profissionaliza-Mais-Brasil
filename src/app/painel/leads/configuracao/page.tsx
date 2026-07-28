import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PageHeader } from "@/components/painel/page-header"
import { AutomationGate } from "@/components/painel/automation-gate"
import { listLeadAssignees } from "@/lib/automation/assign"
import { LeadsDistribuicaoClient } from "@/components/painel/leads-distribuicao-client"
import { requirePainelPage } from "@/lib/auth/painel-guard"

export const dynamic = "force-dynamic"

export default async function PainelLeadsConfiguracaoPage() {
  await requirePainelPage("leads.config")
  const session = await auth()
  if (!session?.user || session.user.role !== "RESELLER" || !session.user.tenantId) {
    redirect("/login?callbackUrl=/painel/leads/configuracao")
  }

  const tenantId = session.user.tenantId
  const [tenant, members] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { automationEnabled: true, leadAutoAssign: true },
    }),
    listLeadAssignees(tenantId),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Distribuição de leads"
        description="Defina como os leads são distribuídos entre os consultores da sua equipe."
        actions={
          <Link
            href="/painel/leads"
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao CRM
          </Link>
        }
      />
      <AutomationGate enabled={!!tenant?.automationEnabled}>
        <LeadsDistribuicaoClient
          initialAutoAssign={!!tenant?.leadAutoAssign}
          members={members}
        />
      </AutomationGate>
    </div>
  )
}
