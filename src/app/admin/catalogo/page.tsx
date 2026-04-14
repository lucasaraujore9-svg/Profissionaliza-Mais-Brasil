import { PageHeader } from "@/components/painel/page-header"
import { AdminCatalogClient } from "@/components/admin/admin-catalog-client"

export default function AdminCatalogPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Catálogo"
        description="Sincronize os cursos da Escola Avançada e gerencie o catálogo agregado."
      />
      <AdminCatalogClient />
    </div>
  )
}
