import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { requireAdminPage } from "@/lib/auth/admin-guard"
import { PageHeader } from "@/components/painel/page-header"
import { WriteGate } from "@/components/shared/permissions/permission-context"
import { AdminEmailAccountsClient } from "@/components/admin/admin-email-accounts-client"
import { listSmtpAccountsForAdmin } from "@/lib/email/smtp-pool"

export const dynamic = "force-dynamic"

export default async function AdminEmailAccountsPage() {
  await requireAdminPage("integracoes.view")
  const accounts = await listSmtpAccountsForAdmin()

  return (
    <WriteGate
      perm="integracoes.manage"
      notice="Você está vendo as caixas de e-mail em modo somente leitura. Para editá-las, peça a permissão de integrações."
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
          title="Caixas de e-mail"
          description="Contas que enviam os e-mails do sistema, com o total de envios de hoje em cada uma."
        />
        <AdminEmailAccountsClient accounts={accounts} />
      </div>
    </WriteGate>
  )
}
