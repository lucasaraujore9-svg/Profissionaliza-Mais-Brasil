import { redirect } from "next/navigation"
import { requireAdminPage } from "@/lib/auth/admin-guard"
import { prisma } from "@/lib/prisma"
import { PageHeader } from "@/components/painel/page-header"
import { MessageTemplateEditor } from "@/components/painel/message-template-editor"
import { WriteGate } from "@/components/shared/permissions/permission-context"

export default async function AdminAutomacaoMensagensPage() {
  await requireAdminPage("automacao.view")

  const settings = await prisma.systemSettings.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
    select: { pmbAutomationEnabled: true },
  })

  if (!settings.pmbAutomationEnabled) {
    redirect("/admin/automacao")
  }

  return (
    <WriteGate
      perm="automacao.manage"
      notice="Você está vendo os templates em modo somente leitura. Para editá-los, peça a permissão “Configurar a automação”."
    >
      <div className="space-y-6">
        <PageHeader
          title="Mensagens automáticas · Vitrine PMB"
          description="Edite os textos enviados em cada etapa do funil para os leads do site institucional."
        />
        <MessageTemplateEditor apiBase="/api/admin/automacao" />
      </div>
    </WriteGate>
  )
}
