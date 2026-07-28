import { NotificationsPage } from "@/components/shared/notifications-page"
import { requirePainelPage } from "@/lib/auth/painel-guard"

export default async function PainelNotificationsPage() {
  // Caixa de notificações do próprio usuário — todo membro tem.
  await requirePainelPage("dashboard.view")

  return <NotificationsPage />
}
