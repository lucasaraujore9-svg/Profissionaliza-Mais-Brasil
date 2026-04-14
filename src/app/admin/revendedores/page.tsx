import { PageHeader } from "@/components/painel/page-header"
import { ResellerListClient } from "@/components/admin/reseller-list-client"

export default function AdminResellersPage() {
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
