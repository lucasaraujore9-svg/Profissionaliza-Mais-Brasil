import { CouponGrid } from "@/components/painel/coupon-grid"
import { requirePainelPage } from "@/lib/auth/painel-guard"

export default async function PainelCuponsPage() {
  await requirePainelPage("cupons.view")

  return (
    <div className="space-y-6">
      <CouponGrid />
    </div>
  )
}
