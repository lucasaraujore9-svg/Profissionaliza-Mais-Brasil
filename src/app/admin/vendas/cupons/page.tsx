import { redirect } from "next/navigation"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { VendasCuponsClient } from "@/components/admin/vendas-cupons-client"
import { effectiveSalesCap } from "@/lib/coupons/sales-cap"

export const dynamic = "force-dynamic"

export default async function VendasCuponsPage() {
  const session = await requireAdminSession()
  if (!session) redirect("/login?callbackUrl=/admin/vendas/cupons")
  if (session.role !== "SUPER_ADMIN" && session.role !== "PMB_SALES") {
    redirect("/admin")
  }

  const cap = await effectiveSalesCap(session)

  return (
    <div className="p-8">
      <VendasCuponsClient cap={cap} />
    </div>
  )
}
