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
  // Assinaturas tem familia propria de permissao: quem so cuida do catalogo de
  // cursos nao precisa mexer no preco da assinatura da loja.
  const canViewPlans = ctx.can("assinaturas.view")
  const canManagePlans = ctx.can("assinaturas.manage")

  return (
    <div className="space-y-6">
      <PageHeader
        title="Catálogo"
        description={
          canManageCourses
            ? "Gerencie os cursos, pacotes e assinaturas da sua vitrine: preço, visibilidade e destaque."
            : "Consulte os cursos, pacotes e assinaturas da sua vitrine."
        }
      />

      <PainelCatalogTabs
        canManageCourses={canManageCourses}
        canManagePackages={canManagePackages}
        canViewPlans={canViewPlans}
        canManagePlans={canManagePlans}
      />
    </div>
  )
}
