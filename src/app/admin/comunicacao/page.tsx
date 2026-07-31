import { PageHeader } from "@/components/painel/page-header"
import { requireAdminPage } from "@/lib/auth/admin-guard"
import { ComunicacaoAdminClient } from "@/components/admin/comunicacao-admin-client"
import { WriteGate } from "@/components/shared/permissions/permission-context"

export default async function AdminComunicacaoPage() {
  await requireAdminPage("comunicacao.view")

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comunicação"
        description="Notificações push: dispositivo, envio manual e automáticos do sistema."
      />
      <WriteGate
        perm="comunicacao.manage"
        notice="Você está vendo a comunicação em modo somente leitura. Para enviar comunicados, peça a permissão “Enviar comunicados”."
      >
        <ComunicacaoAdminClient />
      </WriteGate>
    </div>
  )
}
