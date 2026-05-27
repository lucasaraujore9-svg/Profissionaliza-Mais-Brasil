import { redirect } from "next/navigation"
import Link from "next/link"
import { Inbox, Zap } from "lucide-react"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PageHeader } from "@/components/painel/page-header"
import { LeadsKanbanBoard } from "@/components/painel/leads-kanban-board"

export default async function PainelLeadsPage() {
  const session = await auth()
  if (!session?.user || session.user.role !== "RESELLER" || !session.user.tenantId) {
    redirect("/login?callbackUrl=/painel/leads")
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: { automationEnabled: true },
  })

  if (!tenant?.automationEnabled) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Leads"
          description="Visualize e trabalhe os leads gerados pela sua vitrine."
        />
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <Inbox className="mx-auto h-10 w-10 text-gray-300" aria-hidden />
          <h2 className="mt-3 text-base font-semibold text-[var(--color-pmb-green-900)]">
            Módulo Automação não habilitado
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            O Kanban de leads e o disparo automático de WhatsApp fazem parte do
            módulo Automação. Fale com seu account manager para habilitar.
          </p>
          <Link
            href="/painel/automacao"
            className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-[var(--color-pmb-green)] px-3 py-1.5 text-xs font-semibold text-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-mist)]"
          >
            <Zap className="h-3.5 w-3.5" />
            Saiba mais sobre Automação
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description="Acompanhe e trabalhe os leads gerados pela vitrine, formulários e checkouts."
      />
      <LeadsKanbanBoard />
    </div>
  )
}
