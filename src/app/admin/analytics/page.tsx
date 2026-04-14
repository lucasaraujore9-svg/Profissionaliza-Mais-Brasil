import { PageHeader } from "@/components/painel/page-header"
import { AdminAnalyticsClient } from "@/components/admin/admin-analytics-client"

export default function AdminAnalyticsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Indicadores globais, KPIs e ranking dos revendedores."
      />
      <AdminAnalyticsClient />
    </div>
  )
}
