import { PageHeader } from "@/components/painel/page-header"
import { AdminConfigClient } from "@/components/admin/admin-config-client"
import { requireAdminSession } from "@/lib/auth/admin-session"

export default async function AdminConfigPage() {
  const ctx = await requireAdminSession()
  const canEditGateway = ctx?.role === "SUPER_ADMIN"

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        description="Parâmetros globais, integrações, webhooks e informações do sistema."
      />
      <AdminConfigClient canEditGateway={canEditGateway} />
    </div>
  )
}
