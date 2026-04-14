import { Download } from "lucide-react"
import { PageHeader } from "@/components/painel/page-header"
import { Button } from "@/components/ui/button"
import { FinanceSummaryCards } from "@/components/painel/finance-summary-cards"
import { FinanceFilterBar } from "@/components/painel/finance-filter-bar"
import { FinanceBarChart } from "@/components/painel/finance-bar-chart"
import { FinancePaymentTable } from "@/components/painel/finance-payment-table"

export default function PainelFinanceiroPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Financeiro"
        description="Acompanhe suas receitas, pagamentos e exporte relatórios."
        actions={
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Exportar CSV
          </Button>
        }
      />

      <FinanceSummaryCards />
      <FinanceFilterBar />
      <FinanceBarChart />
      <FinancePaymentTable />
    </div>
  )
}
