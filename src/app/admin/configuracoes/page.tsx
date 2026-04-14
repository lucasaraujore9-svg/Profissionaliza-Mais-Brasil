import { PageHeader } from "@/components/painel/page-header"
import { AdminConfigClient } from "@/components/admin/admin-config-client"

export default function AdminConfigPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        description="Parâmetros globais, integrações, webhooks e informações do sistema."
      />
      <AdminConfigClient />
    </div>
  )
}
