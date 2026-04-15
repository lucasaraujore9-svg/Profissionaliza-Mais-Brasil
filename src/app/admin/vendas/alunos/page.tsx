import { redirect } from "next/navigation"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { VendasAlunosClient } from "@/components/admin/vendas-alunos-client"

export const dynamic = "force-dynamic"

export default async function VendasAlunosPage() {
  const session = await requireAdminSession()
  if (!session) redirect("/login?callbackUrl=/admin/vendas/alunos")
  if (session.role !== "SUPER_ADMIN" && session.role !== "PMB_SALES") {
    redirect("/admin")
  }

  return (
    <div className="p-8">
      <VendasAlunosClient />
    </div>
  )
}
