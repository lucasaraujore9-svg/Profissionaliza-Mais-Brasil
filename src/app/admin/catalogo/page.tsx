import { PageHeader } from "@/components/painel/page-header"
import { AdminCatalogTabs } from "@/components/admin/admin-catalog-tabs"
import { requireAdminPage } from "@/lib/auth/admin-guard"
import { prisma } from "@/lib/prisma"

export default async function AdminCatalogPage() {
  const session = await requireAdminPage("catalogo.view")
  const canEdit = session.can("catalogo.manage")
  // Assinaturas tem familia propria de permissao: quem cuida do catalogo de
  // cursos nao necessariamente responde pelo produto de assinatura.
  const canViewPlans = session.can("assinaturas.view")
  const canManagePlans = session.can("assinaturas.manage")
  // Cursos produzidos pelas UNIDADES. Familia propria de permissao: curadoria do
  // catalogo da PMB e uma coisa; pausar o produto de uma unidade e outra.
  const canViewAuthored = session.can("cursosAutorais.view")
  const canManageAuthored = session.can("cursosAutorais.manage")

  // Opcoes do seletor de escopo do plano. So carregadas quando a aba existe —
  // sao duas queries que nao servem a quem nao a ve.
  const [categories, packages] = canViewPlans
    ? await Promise.all([
        prisma.category.findMany({
          where: { isActive: true },
          select: { id: true, name: true },
          orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
        }),
        prisma.coursePackage.findMany({
          where: { tenantId: null, enabled: true },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
      ])
    : [[], []]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Catálogo"
        description="Sincronize o catálogo central de cursos, monte pacotes e assinaturas, e gerencie a curadoria agregada."
      />
      <AdminCatalogTabs
        canEdit={canEdit}
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
