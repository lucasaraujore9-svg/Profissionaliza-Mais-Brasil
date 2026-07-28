import { PageHeader } from "@/components/painel/page-header"
import { ConfigTabs } from "@/components/painel/config-tabs"
import { DeleteAccountRequest } from "@/components/painel/delete-account-request"
import { requirePainelPage } from "@/lib/auth/painel-guard"

export default async function PainelConfiguracoesPage() {
  await requirePainelPage("perfil.edit")

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
