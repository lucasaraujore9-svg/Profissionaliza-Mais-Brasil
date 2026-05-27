import { redirect } from "next/navigation"
import { Inbox } from "lucide-react"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { prisma } from "@/lib/prisma"
import { PageHeader } from "@/components/painel/page-header"
import { LeadsKanbanBoard } from "@/components/painel/leads-kanban-board"

export default async function AdminLeadsPage() {
  const session = await requireAdminSession()
  if (!session) redirect("/login?callbackUrl=/admin/leads")
  if (session.role !== "SUPER_ADMIN" && session.role !== "PMB_SALES") {
    redirect("/admin")
  }

  const settings = await prisma.systemSettings.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
    select: { pmbAutomationEnabled: true },
  })

  if (!settings.pmbAutomationEnabled) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Leads · Vitrine PMB"
          description="Acompanhe os leads gerados pelo site institucional."
        />
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <Inbox className="mx-auto h-10 w-10 text-gray-300" aria-hidden />
          <h2 className="mt-3 text-base font-semibold text-[var(--color-pmb-green-900)]">
            Módulo Automação PMB desativado
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Ative em Automação para começar a captar leads pelo formulário do
            curso na vitrine institucional.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads · Vitrine PMB"
        description="Acompanhe e trabalhe os leads gerados pelo site institucional, formulários e checkouts."
      />
      <LeadsKanbanBoard apiBase="/api/admin/leads" />
    </div>
  )
}
