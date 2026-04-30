import { PageHeader } from "@/components/painel/page-header"
import { ReportsClient } from "@/components/admin/reports-client"

export default function AdminReportsPage() {
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
