import { PageHeader } from "@/components/painel/page-header"
import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"
import { AdminFinanceSummary } from "@/components/admin/admin-finance-summary"
import { AdminPaymentList } from "@/components/admin/admin-payment-list"
import { AdminOverdueSection } from "@/components/admin/admin-overdue-section"

export default function AdminFinancePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Financeiro"
        description="Acompanhe o desempenho financeiro global da plataforma."
        actions={
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Exportar relatório
          </Button>
        }
      />
      <AdminFinanceSummary />
      <AdminOverdueSection />
      <AdminPaymentList />
    </div>
  )
}
