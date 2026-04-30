import { PageHeader } from "@/components/painel/page-header"
import { AdminDashboardClient } from "@/components/admin/admin-dashboard-client"
import { requireAdminSession } from "@/lib/auth/admin-session"

function timeGreeting(date = new Date()): string {
  const hour = date.getHours()
  if (hour < 12) return "Bom dia"
  if (hour < 18) return "Boa tarde"
  return "Boa noite"
}

export default async function AdminDashboardPage() {
  const ctx = await requireAdminSession()
  const firstName = ctx?.name?.split(" ")[0] ?? "Admin"

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${timeGreeting()}, ${firstName}`}
        description="Visão geral do ecossistema Profissionaliza Mais Brasil."
      />
      <AdminDashboardClient />
    </div>
  )
}
