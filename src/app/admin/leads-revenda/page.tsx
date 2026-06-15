import { redirect } from "next/navigation"
import Link from "next/link"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { prisma } from "@/lib/prisma"
import { PageHeader } from "@/components/painel/page-header"
import {
  LeadsRevendaList,
  type RevendaLead,
  type LeadStatus,
} from "@/components/admin/leads-revenda-list"
import { LeadsRevendaKanban } from "@/components/admin/leads-revenda-kanban"

export const dynamic = "force-dynamic"

const TABS: { value: LeadStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "Todos" },
  { value: "NEW", label: "Novos" },
  { value: "CONTACTED", label: "Contatados" },
  { value: "CONVERTED", label: "Convertidos" },
  { value: "LOST", label: "Perdidos" },
]

export default async function AdminLeadsRevendaPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; view?: string }>
}) {
  const session = await requireAdminSession()
  if (!session) redirect("/login?callbackUrl=/admin/leads-revenda")
  if (session.role !== "SUPER_ADMIN" && session.role !== "PMB_SALES") {
    redirect("/admin")
  }

  const sp = await searchParams
  const view = sp.view === "kanban" ? "kanban" : "list"
  const valid = ["NEW", "CONTACTED", "CONVERTED", "LOST"]
  // O filtro por status só se aplica à lista. O kanban mostra todas as colunas.
  const status =
    view === "list" && valid.includes(sp.status ?? "")
      ? (sp.status as LeadStatus)
      : "ALL"

  const allRows = await prisma.lead.findMany({
    where: status !== "ALL" ? { status } : {},
    orderBy: { createdAt: "desc" },
    take: view === "kanban" ? 300 : 100,
    include: { referrer: { select: { name: true } } },
  })

  // Esconde leads legados de origem contato — antes da separacao contato/revenda
  // o formulario de contato caia em /api/leads e a origem ficava serializada em
  // `notes` ("Origem: /contato"). Hoje contato vira ContactMessage; estes
  // registros antigos nao pertencem ao funil de revenda.
  const rows = allRows.filter(
    (l) =>
      l.source !== "/contato" &&
      !(l.notes ?? "").includes("Origem: /contato"),
  )

  const leads: RevendaLead[] = rows.map((l) => ({
    id: l.id,
    email: l.email,
    companyName: l.companyName,
    phone: l.phone,
    plan: l.plan,
    city: l.city,
    state: l.state,
    source: l.source,
    status: l.status,
    notes: l.notes,
    createdAt: l.createdAt.toISOString(),
    referrerName: l.referrer?.name ?? null,
    convertedTenantId: l.tenantId,
  }))

  const canConvert = session.role === "SUPER_ADMIN"

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader
          title="Leads de revenda"
          description="Interessados em abrir uma vitrine (formulário Seja Revendedor)."
        />

        {/* Alterna entre a lista (com filtro de status) e o kanban (colunas
            por status, arrastar para mover). Preserva o ?status ativo ao voltar
            para a lista. */}
        <div className="inline-flex shrink-0 rounded-full border border-gray-200 bg-white p-0.5">
          <Link
            href={
              status !== "ALL"
                ? `/admin/leads-revenda?status=${status}`
                : "/admin/leads-revenda"
            }
            className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
              view === "list"
                ? "bg-[var(--color-pmb-green)] text-white"
                : "text-gray-600"
            }`}
          >
            Lista
          </Link>
          <Link
            href="/admin/leads-revenda?view=kanban"
            className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
              view === "kanban"
                ? "bg-[var(--color-pmb-green)] text-white"
                : "text-gray-600"
            }`}
          >
            Kanban
          </Link>
        </div>
      </div>

      {view === "list" ? (
        <>
          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => {
              const href =
                t.value === "ALL"
                  ? "/admin/leads-revenda"
                  : `/admin/leads-revenda?status=${t.value}`
              const active = status === t.value
              return (
                <Link
                  key={t.value}
                  href={href}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-bold ${
                    active
                      ? "bg-[var(--color-pmb-green)] text-white"
                      : "border border-gray-200 bg-white text-gray-600"
                  }`}
                >
                  {t.label}
                </Link>
              )
            })}
          </div>

          <LeadsRevendaList
            leads={leads}
            apiBase="/api/admin/leads-revenda"
            canConvert={canConvert}
          />
        </>
      ) : (
        <LeadsRevendaKanban
          leads={leads}
          apiBase="/api/admin/leads-revenda"
          canConvert={canConvert}
        />
      )}
    </div>
  )
}
