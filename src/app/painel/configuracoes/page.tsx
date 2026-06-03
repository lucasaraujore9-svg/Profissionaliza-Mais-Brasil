import { PageHeader } from "@/components/painel/page-header"
import { ConfigTabs } from "@/components/painel/config-tabs"
import { DeleteAccountRequest } from "@/components/painel/delete-account-request"

export default function PainelConfiguracoesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        description="Gerencie sua conta, pagamento e segurança."
      />
      <ConfigTabs />
      <DeleteAccountRequest />
    </div>
  )
}
