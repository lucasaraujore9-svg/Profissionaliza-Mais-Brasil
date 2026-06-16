import { redirect } from "next/navigation"
import { PageHeader } from "@/components/painel/page-header"
import { ReportsClient } from "@/components/admin/reports-client"
import { requireAdminSession } from "@/lib/auth/admin-session"

export const dynamic = "force-dynamic"

export default async function AdminReportsPage() {
  const session = await requireAdminSession()
  if (!session) redirect("/login?callbackUrl=/admin/relatorios")
  // Runners de relatório são globais. Papéis modelados: SUPER_ADMIN (tudo),
  // PMB_SALES (B2C via pmbSalesAllowed) e PMB_RESELLER_MGR (escopado por tenant
  // que ele gerencia). PMB_REVENDA_SALES/PMB_SALES_MGR não são escopados →
  // exportariam dados fora do escopo deles; ficam de fora.
  const REPORT_ROLES = ["SUPER_ADMIN", "PMB_SALES", "PMB_RESELLER_MGR"]
  if (!REPORT_ROLES.includes(session.role)) {
    redirect("/admin")
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios"
        description="Gere planilhas (CSV) de vendas, alunos, financeiro e catálogo. Use os filtros de período quando aplicável."
      />
      <ReportsClient />
    </div>
  )
}
