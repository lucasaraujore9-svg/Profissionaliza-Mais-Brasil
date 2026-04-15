import { PageHeader } from "@/components/painel/page-header"
import { AdminCatalogClient } from "@/components/admin/admin-catalog-client"
import { requireAdminSession } from "@/lib/auth/admin-session"

export default async function AdminCatalogPage() {
  const session = await requireAdminSession()
  const canEdit = session?.role === "SUPER_ADMIN"

  return (
    <div className="space-y-6">
      <PageHeader
        title="Catálogo"
        description="Sincronize os cursos da Escola Avançada e gerencie o catálogo agregado."
      />
      <AdminCatalogClient canEdit={canEdit} />
    </div>
  )
}
