import { PageHeader } from "@/components/painel/page-header"
import { AnalyticsFilters } from "@/components/admin/analytics-filters"
import { AnalyticsKpiCards } from "@/components/admin/analytics-kpi-cards"
import { AnalyticsCharts } from "@/components/admin/analytics-charts"
import { AnalyticsRankingTable } from "@/components/admin/analytics-ranking-table"

export default function AdminAnalyticsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Indicadores globais, KPIs e ranking dos revendedores."
      />
      <AnalyticsFilters />
      <AnalyticsKpiCards />
      <AnalyticsCharts />
      <AnalyticsRankingTable />
    </div>
  )
}
