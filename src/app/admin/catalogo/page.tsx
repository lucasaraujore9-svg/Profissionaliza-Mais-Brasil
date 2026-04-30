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
        description="Sincronize o catálogo central de cursos e gerencie a curadoria agregada."
      />
      <AdminCatalogClient canEdit={canEdit} />
    </div>
  )
}
