import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { PageHeader } from "@/components/painel/page-header"
import { FinanceiroTabs } from "@/components/admin/financeiro-tabs"

export default async function AdminFinancePage() {
  const session = await auth()
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!role || !["SUPER_ADMIN", "PMB_SALES", "PMB_RESELLER_MGR"].includes(role)) {
    redirect("/login")
  }
  const canMarkPaid = role === "SUPER_ADMIN"

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financeiro"
        description="Acompanhe e gerencie cobranças, pagamentos e comissões da plataforma."
      />
      <FinanceiroTabs canMarkPaid={canMarkPaid} />
    </div>
  )
}
