import { PageHeader } from "@/components/painel/page-header"
import { AdminCatalogTabs } from "@/components/admin/admin-catalog-tabs"
import { requireAdminSession } from "@/lib/auth/admin-session"

export default async function AdminCatalogPage() {
  const session = await requireAdminSession()
  const canEdit = session?.role === "SUPER_ADMIN"

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
