import { PageHeader } from "@/components/painel/page-header"
import { requireAdminPage } from "@/lib/auth/admin-guard"
import { GlobalStudentsClient } from "@/components/admin/global-students-client"

export const dynamic = "force-dynamic"

export default async function AdminAlunosPage() {
  const session = await requireAdminPage("alunosRede.view")
  return (
    <div className="space-y-6">
      <PageHeader
        title="Alunos"
        description="Visão consolidada de todos os alunos — vitrine principal PMB e revendedores."
      />
      <GlobalStudentsClient canImpersonate={session.can("alunos.impersonate")} />
    </div>
  )
}
