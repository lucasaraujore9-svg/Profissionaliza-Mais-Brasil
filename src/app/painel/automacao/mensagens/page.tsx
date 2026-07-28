import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PageHeader } from "@/components/painel/page-header"
import { MessageTemplateEditor } from "@/components/painel/message-template-editor"
import { requirePainelPage } from "@/lib/auth/painel-guard"

export default async function PainelAutomacaoMensagensPage() {
  await requirePainelPage("automacao.manage")
  const session = await auth()
  if (
    !session?.user ||
    session.user.role !== "RESELLER" ||
    !session.user.tenantId
  ) {
    redirect("/login?callbackUrl=/painel/automacao/mensagens")
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: { automationEnabled: true },
  })

  if (!tenant?.automationEnabled) {
    redirect("/painel/automacao")
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mensagens automáticas"
        description="Edite os textos enviados automaticamente em cada etapa do funil."
      />
      <MessageTemplateEditor />
    </div>
  )
}
