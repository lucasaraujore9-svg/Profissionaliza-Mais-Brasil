import { requireAdminPage } from "@/lib/auth/admin-guard"
import { PageHeader } from "@/components/painel/page-header"
import { ArtesAdminClient } from "@/components/admin/artes-admin-client"

export default async function AdminArtesPage() {
  // Banco de artes: SUPER_ADMIN e PMB_DESIGNER gerenciam (as APIs exigem
  // requireArtesManager; este guard evita o shell vazio para os demais perfis).
  await requireAdminPage("artes.view")

  return (
    <div className="space-y-6">
      <PageHeader
        title="Artes de divulgação"
        description="Suba as artes sem logo, telefone ou valor — o sistema personaliza com os dados de cada unidade na hora do download."
      />
      <ArtesAdminClient />
    </div>
  )
}
