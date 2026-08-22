import { PageHeader } from "@/components/painel/page-header"
import { PainelCatalogTabs } from "@/components/painel/painel-catalog-tabs"
import { requirePainelPage } from "@/lib/auth/painel-guard"
import { prisma } from "@/lib/prisma"
import { isCourseAuthoringEnabled } from "@/lib/course-authoring/module-gate"

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
  // Cursos de AUTORIA da unidade. DUAS perguntas, nesta ordem:
  //
  //   1. a unidade tem o modulo habilitado pelo sistema mae?
  //      (`Tenant.courseAuthoringEnabled` — habilitacao comercial)
  //   2. esta pessoa opera o modulo? (`cursosAutorais.*` — familia propria de
  //      permissao: definir o preco de um curso da PMB na vitrine nao deveria
  //      habilitar publicar produto proprio na rede, com comissao e repasse)
  //
  // Sem a primeira, a aba aparecia para TODA revenda: o preset do dono e
  // `owner: ALL`. Ver `lib/course-authoring/module-gate.ts`.
  const authoringModuleOn = await isCourseAuthoringEnabled(ctx.tenantId)
  const canViewAuthored = authoringModuleOn && ctx.can("cursosAutorais.view")
  const canManageAuthored = authoringModuleOn && ctx.can("cursosAutorais.manage")

  // Opcoes de escopo para a unidade montar um plano PROPRIO. Pacotes: os dela e
  // os da PMB — nunca os de outra revenda, que liberariam cursos que nao sao
  // dela (a API repete a checagem; aqui e so o que o seletor oferece).
  const [categories, packages] = canViewPlans
    ? await Promise.all([
        prisma.category.findMany({
          where: { isActive: true },
          select: { id: true, name: true },
          orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
        }),
        prisma.coursePackage.findMany({
          where: {
            enabled: true,
            OR: [{ tenantId: null }, { tenantId: ctx.tenantId }],
          },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
      ])
    : [[], []]

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
        canViewAuthored={canViewAuthored}
        canManageAuthored={canManageAuthored}
        categories={categories}
        packages={packages}
      />
    </div>
  )
}
