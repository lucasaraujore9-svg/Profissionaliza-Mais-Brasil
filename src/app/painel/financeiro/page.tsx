import { FinanceDashboard } from "@/components/painel/finance-dashboard"
import { requirePainelPage } from "@/lib/auth/painel-guard"

export default async function PainelFinanceiroPage() {
  await requirePainelPage("financeiro.view")

  return <FinanceDashboard />
}
