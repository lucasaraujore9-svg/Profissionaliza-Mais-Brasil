import Link from "next/link"
import { redirect } from "next/navigation"
import { Settings2 } from "lucide-react"
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
        actions={
          tenant?.automationEnabled ? (
            <Link
              href="/painel/leads/configuracao"
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              <Settings2 className="h-4 w-4" />
              Distribuição
            </Link>
          ) : null
        }
      />
      <AutomationGate enabled={!!tenant?.automationEnabled}>
        <LeadsKanbanBoard />
      </AutomationGate>
    </div>
  )
}
