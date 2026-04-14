import { PageHeader } from "@/components/painel/page-header"
import { AdminMetricCards } from "@/components/admin/admin-metric-cards"
import { AdminQuickStatsBar } from "@/components/admin/admin-quick-stats-bar"
import { AdminDualRevenueChart } from "@/components/admin/admin-dual-revenue-chart"
import { AdminTopResellersTable } from "@/components/admin/admin-top-resellers-table"
import { AdminAlertsPanel } from "@/components/admin/admin-alerts-panel"

export default function AdminDashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Bom dia, Admin"
        description="Visão geral do ecossistema Profissionaliza Mais Brasil."
      />
      <AdminQuickStatsBar />
      <AdminMetricCards />
      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <AdminDualRevenueChart />
        <AdminAlertsPanel />
      </div>
      <AdminTopResellersTable />
    </div>
  )
}
