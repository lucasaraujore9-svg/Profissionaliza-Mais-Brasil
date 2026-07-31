import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PageHeader } from "@/components/painel/page-header"
import { WhatsAppConnectionPanel } from "@/components/painel/whatsapp-connection-panel"
import { requirePainelPage } from "@/lib/auth/painel-guard"
import { WriteGate } from "@/components/shared/permissions/permission-context"

export default async function PainelAutomacaoConexaoPage() {
  await requirePainelPage("automacao.view")
  const session = await auth()
  if (
    !session?.user ||
    session.user.role !== "RESELLER" ||
    !session.user.tenantId
  ) {
    redirect("/login?callbackUrl=/painel/automacao/conexao")
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: {
      automationEnabled: true,
      waStatus: true,
      waConnectedPhone: true,
    },
  })

  if (!tenant?.automationEnabled) {
    redirect("/painel/automacao")
  }

  return (
    <WriteGate
      perm="automacao.manage"
      notice="Você está vendo a automação em modo somente leitura. Para conectar ou desconectar o WhatsApp, peça a permissão “Configurar a automação”."
    >
      <div className="space-y-6">
        <PageHeader
          title="Conexão WhatsApp"
          description="Conecte um número de WhatsApp para disparar mensagens automáticas para os leads da sua vitrine."
        />
        <WhatsAppConnectionPanel
          initialStatus={tenant.waStatus}
          initialPhone={tenant.waConnectedPhone}
        />
      </div>
    </WriteGate>
  )
}
