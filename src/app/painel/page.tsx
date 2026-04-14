import { PageHeader } from "@/components/painel/page-header"
import { MetricCards } from "@/components/painel/metric-cards"
import { RevenueChart } from "@/components/painel/revenue-chart"
import { RecentSales } from "@/components/painel/recent-sales"
import { QuickActions } from "@/components/painel/quick-actions"

export default function PainelDashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Bem-vindo, João"
        description="Aqui está o resumo da sua operação nos últimos 30 dias."
        actions={
          <select className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
            <option>Últimos 30 dias</option>
            <option>Últimos 7 dias</option>
            <option>Últimos 90 dias</option>
          </select>
        }
      />

      <MetricCards />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <RevenueChart />
        <QuickActions />
      </div>

      <RecentSales />
    </div>
  )
}
