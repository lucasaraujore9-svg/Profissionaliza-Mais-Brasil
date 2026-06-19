import { PageHeader } from "@/components/painel/page-header"
import { PainelCatalogTabs } from "@/components/painel/painel-catalog-tabs"

export default function PainelCursosPage() {
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
