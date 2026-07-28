import { PageHeader } from "@/components/painel/page-header"
import { requireAdminPage } from "@/lib/auth/admin-guard"
import { ComunicacaoAdminClient } from "@/components/admin/comunicacao-admin-client"

export default async function AdminComunicacaoPage() {
  await requireAdminPage("comunicacao.manage")

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comunicação"
        description="Notificações push: dispositivo, envio manual e automáticos do sistema."
      />
      <ComunicacaoAdminClient />
    </div>
  )
}
