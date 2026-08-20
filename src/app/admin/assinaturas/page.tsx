import { PageHeader } from "@/components/painel/page-header"
import { requireAdminPage } from "@/lib/auth/admin-guard"
import { AdminPlansClient } from "@/components/admin/admin-plans-client"
import { prisma } from "@/lib/prisma"

export default async function AdminAssinaturasPage() {
  const ctx = await requireAdminPage("assinaturas.view")
  const canEdit = ctx.can("assinaturas.manage")

  // Opções do seletor de escopo. Carregadas no servidor porque o formulário
  // precisa delas já na primeira pintura — e são listas curtas.
  const [categories, packages] = await Promise.all([
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assinaturas"
        description="Planos de assinatura da vitrine PMB. Distribuídos automaticamente às vitrines das unidades, que podem ajustar preço e visibilidade."
      />
      <AdminPlansClient
        canEdit={canEdit}
        categories={categories}
        packages={packages}
      />
    </div>
  )
}
