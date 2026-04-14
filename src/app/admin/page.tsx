import { PageHeader } from "@/components/painel/page-header"
import { AdminDashboardClient } from "@/components/admin/admin-dashboard-client"

export default function AdminDashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Bom dia, Admin"
        description="Visão geral do ecossistema Profissionaliza Mais Brasil."
      />
      <AdminDashboardClient />
    </div>
  )
}
