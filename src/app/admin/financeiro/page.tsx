import { requireAdminPage } from "@/lib/auth/admin-guard"
import { PageHeader } from "@/components/painel/page-header"
import { FinanceiroTabs } from "@/components/admin/financeiro-tabs"

export default async function AdminFinancePage() {
  // `financeiro.view` abre a aba "Comissões a pagar" (escopada). Visão geral e
  // mensalidades a receber exigem `financeiro.viewAll`.
  //
  // Antes, o gate da página (`canViewFinance`) incluía o vendedor de curso, mas
  // a API de comissões o rejeitava: ele abria a tela e a única aba disponível
  // devolvia 403. As duas pontas agora leem a mesma permissão.
  const ctx = await requireAdminPage("financeiro.view")

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financeiro"
        description="Acompanhe e gerencie cobranças, pagamentos e comissões da plataforma."
      />
      <FinanceiroTabs
        canMarkPaid={ctx.can("financeiro.manage")}
        canSeeAll={ctx.can("financeiro.viewAll")}
      />
    </div>
  )
}
