import { redirect } from "next/navigation"
import { PageHeader } from "@/components/painel/page-header"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { ComunicacaoAdminClient } from "@/components/admin/comunicacao-admin-client"

export default async function AdminComunicacaoPage() {
  const ctx = await requireAdminSession()
  if (!ctx) redirect("/login")
  if (ctx.role !== "SUPER_ADMIN") redirect("/admin")

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comunicação"
        description="Notificações push: dispositivo, envio manual e automáticos do sistema."
      />
      <ComunicacaoAdminClient />
    </div>
  )
}
