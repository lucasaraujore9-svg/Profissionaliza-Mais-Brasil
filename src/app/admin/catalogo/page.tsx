import { PageHeader } from "@/components/painel/page-header"
import { AdminCatalogTabs } from "@/components/admin/admin-catalog-tabs"
import { requireAdminPage } from "@/lib/auth/admin-guard"

export default async function AdminCatalogPage() {
  const session = await requireAdminPage("catalogo.view")
  const canEdit = session.can("catalogo.manage")

  return (
    <div className="space-y-6">
      <PageHeader
        title="Catálogo"
        description="Sincronize o catálogo central de cursos, monte pacotes e gerencie a curadoria agregada."
      />
      <AdminCatalogTabs canEdit={canEdit} />
    </div>
  )
}
