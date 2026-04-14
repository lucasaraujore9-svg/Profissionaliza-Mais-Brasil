import { PageHeader } from "@/components/painel/page-header"
import { AdminFinanceClient } from "@/components/admin/admin-finance-client"

export default function AdminFinancePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Financeiro"
        description="Acompanhe o desempenho financeiro global da plataforma."
      />
      <AdminFinanceClient />
    </div>
  )
}
