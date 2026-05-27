import { redirect } from "next/navigation"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { prisma } from "@/lib/prisma"
import { PageHeader } from "@/components/painel/page-header"
import { MessageTemplateEditor } from "@/components/painel/message-template-editor"

export default async function AdminAutomacaoMensagensPage() {
  const session = await requireAdminSession()
  if (!session) redirect("/login?callbackUrl=/admin/automacao/mensagens")
  if (session.role !== "SUPER_ADMIN") redirect("/admin")

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
    <div className="space-y-6">
      <PageHeader
        title="Mensagens automáticas · Vitrine PMB"
        description="Edite os textos enviados em cada etapa do funil para os leads do site institucional."
      />
      <MessageTemplateEditor apiBase="/api/admin/automacao" />
    </div>
  )
}
