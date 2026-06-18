import { redirect } from "next/navigation"
import type { UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import {
  canViewFinance,
  canViewFullFinance,
  canMarkPaid as roleCanMarkPaid,
} from "@/lib/auth/roles"
import { PageHeader } from "@/components/painel/page-header"
import { FinanceiroTabs } from "@/components/admin/financeiro-tabs"

export default async function AdminFinancePage() {
  const session = await auth()
  const role = (session?.user as { role?: UserRole } | undefined)?.role
  if (!canViewFinance(role)) {
    redirect("/login")
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financeiro"
        description="Acompanhe e gerencie cobranças, pagamentos e comissões da plataforma."
      />
      <FinanceiroTabs
        canMarkPaid={roleCanMarkPaid(role)}
        canSeeAll={canViewFullFinance(role)}
      />
    </div>
  )
}
