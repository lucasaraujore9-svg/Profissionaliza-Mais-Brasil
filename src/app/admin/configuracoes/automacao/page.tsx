import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { requireAdminPage } from "@/lib/auth/admin-guard"
import { PageHeader } from "@/components/painel/page-header"
import { AdminAutomationSettingsForm } from "@/components/admin/admin-automation-settings-form"
import { WriteGate } from "@/components/shared/permissions/permission-context"

export const dynamic = "force-dynamic"

export default async function AdminAutomationSettingsPage() {
  await requireAdminPage("configuracoes.view")

  const settings = await prisma.systemSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
    select: {
      pmbAutomationEnabled: true,
      pmbAbandonedAfterHours: true,
      pmbWaStatus: true,
      pmbWaConnectedPhone: true,
    },
  })

  return (
    <WriteGate
      perm="configuracoes.manage"
      notice="Você está vendo esta configuração em modo somente leitura. Para editá-la, peça a permissão “Editar as configurações do sistema”."
    >
      <div className="space-y-6">
        <Link
          href="/admin/configuracoes"
          className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 hover:text-[var(--color-pmb-green-900)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar para configurações
        </Link>

        <PageHeader
          title="Automação — site PMB"
          description="Liga/desliga o módulo de Automação (WhatsApp + CRM Kanban) para a vitrine institucional profissionalizamaisbrasil.com.br. Para revendedores, configure individualmente em cada um."
        />

        <AdminAutomationSettingsForm
          initial={{
            pmbAutomationEnabled: settings.pmbAutomationEnabled,
            pmbAbandonedAfterHours: settings.pmbAbandonedAfterHours,
            pmbWaStatus: settings.pmbWaStatus,
            pmbWaConnectedPhone: settings.pmbWaConnectedPhone,
          }}
        />
      </div>
    </WriteGate>
  )
}
