import { redirect } from "next/navigation"
import { PageHeader } from "@/components/painel/page-header"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { GlobalStudentsClient } from "@/components/admin/global-students-client"

export const dynamic = "force-dynamic"

export default async function AdminAlunosPage() {
  const session = await requireAdminSession()
  if (!session) redirect("/login?callbackUrl=/admin/alunos")
  if (session.role !== "SUPER_ADMIN") redirect("/admin")

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alunos"
        description="Visão consolidada de todos os alunos — vitrine principal PMB e revendedores."
      />
      <GlobalStudentsClient />
    </div>
  )
}
