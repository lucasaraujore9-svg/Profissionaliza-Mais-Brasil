import { redirect } from "next/navigation"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { PageHeader } from "@/components/painel/page-header"
import { ArtesAdminClient } from "@/components/admin/artes-admin-client"

export default async function AdminArtesPage() {
  // Banco de artes: SUPER_ADMIN e PMB_DESIGNER gerenciam (as APIs exigem
  // requireArtesManager; este guard evita o shell vazio para os demais perfis).
  const session = await requireAdminSession()
  if (!session) redirect("/login?callbackUrl=/admin/artes")
  if (session.role !== "SUPER_ADMIN" && session.role !== "PMB_DESIGNER") redirect("/admin")

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
