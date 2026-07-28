import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { DashboardWrapper } from "@/components/painel/dashboard-wrapper"
import { TenantBillingCard } from "@/components/painel/tenant-billing-card"
import { getTenantBillingSummary } from "@/lib/tenant-billing/charges"

export default async function PainelDashboardPage() {
  const session = await auth()
  if (!session?.user || session.user.role !== "RESELLER" || !session.user.tenantId) {
    redirect("/login")
  }
  const tenantId = session.user.tenantId

  const user = await prisma.user.findUnique({
    where: { id: session.user.id as string },
    select: { name: true, tenantId: true },
  })

  const firstName = user?.name?.split(" ")[0] ?? "Revendedor"

  // Mensalidade da unidade é assunto do DONO — consultor (TenantMember) também
  // tem `tenantId` na sessão, mas `User.tenantId` só existe no dono direto.
  const isOwner = user?.tenantId === tenantId
  const billing = isOwner ? await getTenantBillingSummary(tenantId) : null

  return (
    <div className="space-y-6">
      {billing && <TenantBillingCard summary={billing} />}
      <DashboardWrapper firstName={firstName} />
    </div>
  )
}
