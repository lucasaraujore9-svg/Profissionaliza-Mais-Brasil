import { redirect } from "next/navigation"
import { adminHome, requireAdminPage } from "@/lib/auth/admin-guard"
import { defaultTab } from "@/lib/reports/tabs"

export const dynamic = "force-dynamic"

// Raiz do hub de BI: valida a sessão e redireciona para a aba de entrada da
// pessoa. Sem nenhuma aba permitida, sai do hub — nunca aterrissa numa aba que
// devolveria 403.
export default async function AdminRelatoriosPage() {
  const session = await requireAdminPage("relatorios.view")
  const tab = defaultTab(session.role, session.permissions)
  redirect(tab ? `/admin/relatorios/${tab}` : adminHome(session))
}
