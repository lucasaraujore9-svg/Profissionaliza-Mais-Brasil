import { PageHeader } from "@/components/painel/page-header"
import { CouponGrid } from "@/components/painel/coupon-grid"

export default function PainelCuponsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Cupons"
        description="Crie códigos promocionais e acompanhe quem está usando."
      />
      <CouponGrid />
    </div>
  )
}
