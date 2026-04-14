import { PageHeader } from "@/components/painel/page-header"
import { CatalogHeader } from "@/components/admin/catalog-header"
import { CatalogCourseGrid } from "@/components/admin/catalog-course-grid"
import { CatalogSyncLog } from "@/components/admin/catalog-sync-log"

export default function AdminCatalogPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Catálogo"
        description="Sincronize os cursos da Escola Avançada e gerencie o catálogo agregado."
      />
      <CatalogHeader />
      <CatalogCourseGrid />
      <CatalogSyncLog />
    </div>
  )
}
