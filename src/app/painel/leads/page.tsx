import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PageHeader } from "@/components/painel/page-header"
import { LeadsKanbanBoard } from "@/components/painel/leads-kanban-board"
import { AutomationGate } from "@/components/painel/automation-gate"

export default async function PainelLeadsPage() {
  const session = await auth()
  if (!session?.user || session.user.role !== "RESELLER" || !session.user.tenantId) {
    redirect("/login?callbackUrl=/painel/leads")
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: { automationEnabled: true },
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description="Acompanhe e trabalhe os leads gerados pela vitrine, formulários e checkouts."
      />
      <AutomationGate enabled={!!tenant?.automationEnabled}>
        <LeadsKanbanBoard />
      </AutomationGate>
    </div>
  )
}
