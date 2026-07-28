import { PageHeader } from "@/components/painel/page-header"
import { PainelCatalogTabs } from "@/components/painel/painel-catalog-tabs"
import { requirePainelPage } from "@/lib/auth/painel-guard"

export default async function PainelCursosPage() {
  await requirePainelPage("catalogo.view")

  return (
    <div className="space-y-6">
      <PageHeader
        title="Catálogo"
        description="Gerencie os cursos e os pacotes da sua vitrine: preço, visibilidade e destaque."
      />

      <PainelCatalogTabs />
    </div>
  )
}
