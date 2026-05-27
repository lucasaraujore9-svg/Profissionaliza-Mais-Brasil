import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PageHeader } from "@/components/painel/page-header"
import { WhatsAppConnectionPanel } from "@/components/painel/whatsapp-connection-panel"

export default async function PainelAutomacaoConexaoPage() {
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
  )
}
