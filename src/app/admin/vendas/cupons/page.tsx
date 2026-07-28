import { requireAdminPage } from "@/lib/auth/admin-guard"
import { VendasCuponsClient } from "@/components/admin/vendas-cupons-client"
import { effectiveSalesCap } from "@/lib/coupons/sales-cap"

export const dynamic = "force-dynamic"

export default async function VendasCuponsPage() {
  const session = await requireAdminPage("cupons.view")

  const cap = await effectiveSalesCap(session)

  return (
    <div className="p-8">
      <VendasCuponsClient cap={cap} />
    </div>
  )
}
