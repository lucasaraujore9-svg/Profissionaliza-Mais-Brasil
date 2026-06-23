import { redirect } from "next/navigation"
import { PageHeader } from "@/components/painel/page-header"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { GlobalStudentsClient } from "@/components/admin/global-students-client"

export const dynamic = "force-dynamic"

export default async function AdminAlunosPage() {
  const session = await requireAdminSession()
  if (!session) redirect("/login?callbackUrl=/admin/alunos")
  // A lista de alunos (vitrine PMB B2C) é servida por /api/admin/alunos com
  // requirePmbSales: só SUPER_ADMIN (todos) e PMB_SALES (suas vendas). Os papéis
  // comerciais de revenda não têm escopo aqui — sem este guard a página abriria
  // e a API retornaria 403 (tela quebrada).
  if (session.role !== "SUPER_ADMIN" && session.role !== "PMB_SALES") {
    redirect("/admin")
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alunos"
        description="Visão consolidada de todos os alunos — vitrine principal PMB e revendedores."
      />
      <GlobalStudentsClient canImpersonate={session.role === "SUPER_ADMIN"} />
    </div>
  )
}
