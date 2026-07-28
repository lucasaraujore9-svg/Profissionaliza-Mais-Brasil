import { PageHeader } from "@/components/painel/page-header"
import { PainelCatalogTabs } from "@/components/painel/painel-catalog-tabs"
import { requirePainelPage } from "@/lib/auth/painel-guard"

export default async function PainelCursosPage() {
  // `catalogo.view` abre a página; a edição é gated à parte. Sem este segundo
  // nível, um Vendedor (que só tem `.view` no preset) enxergaria os botões de
  // editar e levaria 403 do servidor ao clicar.
  const ctx = await requirePainelPage("catalogo.view")
  const canManageCourses = ctx.can("catalogo.manage")
  const canManagePackages = ctx.can("pacotes.manage")

  return (
    <div className="space-y-6">
      <PageHeader
        title="Catálogo"
        description={
          canManageCourses
            ? "Gerencie os cursos e os pacotes da sua vitrine: preço, visibilidade e destaque."
            : "Consulte os cursos e os pacotes da sua vitrine."
        }
      />

      <PainelCatalogTabs
        canManageCourses={canManageCourses}
        canManagePackages={canManagePackages}
      />
    </div>
  )
}
