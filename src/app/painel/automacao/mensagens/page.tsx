import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PageHeader } from "@/components/painel/page-header"
import { MessageTemplateEditor } from "@/components/painel/message-template-editor"
import { requirePainelPage } from "@/lib/auth/painel-guard"
import { WriteGate } from "@/components/shared/permissions/permission-context"

export default async function PainelAutomacaoMensagensPage() {
  await requirePainelPage("automacao.view")
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
    <WriteGate
      perm="automacao.manage"
      notice="Você está vendo os templates em modo somente leitura. Para editá-los, peça a permissão “Configurar a automação”."
    >
      <div className="space-y-6">
        <PageHeader
          title="Mensagens automáticas"
          description="Edite os textos enviados automaticamente em cada etapa do funil."
        />
        <MessageTemplateEditor />
      </div>
    </WriteGate>
  )
}
