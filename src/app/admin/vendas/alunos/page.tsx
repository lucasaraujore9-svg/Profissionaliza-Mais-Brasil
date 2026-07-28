import { requireAdminPage } from "@/lib/auth/admin-guard"
import { VendasAlunosClient } from "@/components/admin/vendas-alunos-client"

export const dynamic = "force-dynamic"

export default async function VendasAlunosPage() {
  await requireAdminPage("alunos.view")

  return (
    <div className="p-8">
      <VendasAlunosClient />
    </div>
  )
}
