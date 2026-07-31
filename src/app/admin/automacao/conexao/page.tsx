import { redirect } from "next/navigation"
import { requireAdminPage } from "@/lib/auth/admin-guard"
import { prisma } from "@/lib/prisma"
import { PageHeader } from "@/components/painel/page-header"
import { WhatsAppConnectionPanel } from "@/components/painel/whatsapp-connection-panel"
import { WriteGate } from "@/components/shared/permissions/permission-context"

export default async function AdminAutomacaoConexaoPage() {
  await requireAdminPage("automacao.view")

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
    <WriteGate
      perm="automacao.manage"
      notice="Você está vendo a automação em modo somente leitura. Para conectar ou desconectar o WhatsApp, peça a permissão “Configurar a automação”."
    >
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
    </WriteGate>
  )
}
