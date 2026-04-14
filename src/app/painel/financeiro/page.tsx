import { PageHeader } from "@/components/painel/page-header"
import { FinanceDashboard } from "@/components/painel/finance-dashboard"

export default function PainelFinanceiroPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Financeiro"
        description="Acompanhe suas receitas, pagamentos e exporte relatórios."
      />
      <FinanceDashboard />
    </div>
  )
}
