import { redirect } from "next/navigation"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { defaultTab } from "@/lib/reports/tabs"

export const dynamic = "force-dynamic"

// Raiz do hub de BI: valida sessão e redireciona para a aba de entrada do papel.
export default async function AdminRelatoriosPage() {
  const session = await requireAdminSession()
  if (!session) redirect("/login?callbackUrl=/admin/relatorios")
  redirect(`/admin/relatorios/${defaultTab(session.role)}`)
}
