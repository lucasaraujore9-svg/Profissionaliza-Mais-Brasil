import { PageHeader } from "@/components/painel/page-header"
import { AdminDashboardClient } from "@/components/admin/admin-dashboard-client"
import { requireAdminPage } from "@/lib/auth/admin-guard"

function timeGreeting(date = new Date()): string {
  const hour = date.getHours()
  if (hour < 12) return "Bom dia"
  if (hour < 18) return "Boa tarde"
  return "Boa noite"
}

const DESCRIPTION_BY_ROLE: Record<string, string> = {
  SUPER_ADMIN: "Visão geral do ecossistema Profissionaliza Mais Brasil.",
  PMB_SALES_MGR: "Resumo das unidades e leads do seu time de vendas.",
  PMB_REVENDA_SALES: "Resumo das suas unidades e leads de revenda.",
  PMB_RESELLER_MGR: "Resumo das unidades sob o seu suporte.",
  PMB_SALES: "Resumo das suas vendas diretas na vitrine PMB.",
}

export default async function AdminDashboardPage() {
  const ctx = await requireAdminPage("dashboard.view")
  const firstName = ctx?.name?.split(" ")[0] ?? "Admin"
  const description =
    (ctx && DESCRIPTION_BY_ROLE[ctx.role]) ??
    "Visão geral do Profissionaliza Mais Brasil."

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${timeGreeting()}, ${firstName}`}
        description={description}
      />
      <AdminDashboardClient />
    </div>
  )
}
