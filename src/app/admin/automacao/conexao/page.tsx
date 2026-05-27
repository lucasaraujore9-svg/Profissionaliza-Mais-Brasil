import { redirect } from "next/navigation"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { prisma } from "@/lib/prisma"
import { PageHeader } from "@/components/painel/page-header"
import { WhatsAppConnectionPanel } from "@/components/painel/whatsapp-connection-panel"

export default async function AdminAutomacaoConexaoPage() {
  const session = await requireAdminSession()
  if (!session) redirect("/login?callbackUrl=/admin/automacao/conexao")
  if (session.role !== "SUPER_ADMIN") redirect("/admin")

  const settings = await prisma.systemSettings.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
    select: {
      pmbAutomationEnabled: true,
      pmbWaStatus: true,
      pmbWaConnectedPhone: true,
    },
  })

  if (!settings.pmbAutomationEnabled) {
    redirect("/admin/automacao")
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Conexão WhatsApp · Vitrine PMB"
        description="Conecte um número de WhatsApp da PMB para disparar mensagens automáticas aos leads do site institucional."
      />
      <WhatsAppConnectionPanel
        initialStatus={settings.pmbWaStatus}
        initialPhone={settings.pmbWaConnectedPhone}
        apiBase="/api/admin/automacao"
      />
    </div>
  )
}
