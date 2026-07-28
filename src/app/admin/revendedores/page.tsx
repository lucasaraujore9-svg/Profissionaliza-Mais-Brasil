import { PageHeader } from "@/components/painel/page-header"
import { requireAdminPage } from "@/lib/auth/admin-guard"
import { ResellerListClient } from "@/components/admin/reseller-list-client"

export default async function AdminResellersPage() {
  // Shell alimentado por /api/admin/revendedores (escopado por papel). Sem este
  // guard a tela abria vazia para quem não tem acesso a unidade nenhuma.
  await requireAdminPage("unidades.view")

  return (
    <div className="space-y-6">
      <PageHeader
        title="Revendedores"
        description="Gerencie os revendedores do ecossistema Profissionaliza Mais Brasil."
      />
      <ResellerListClient />
    </div>
  )
}
