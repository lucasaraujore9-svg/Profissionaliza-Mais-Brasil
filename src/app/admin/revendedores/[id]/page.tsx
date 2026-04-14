import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { ResellerProfile } from "@/components/admin/reseller-profile"
import { ResellerStudentCount } from "@/components/admin/reseller-student-count"
import { ResellerPaymentHistory } from "@/components/admin/reseller-payment-history"
import { ResellerPolicyConfig } from "@/components/admin/reseller-policy-config"
import { ResellerActionButtons } from "@/components/admin/reseller-action-buttons"

export default async function ResellerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <div className="space-y-6">
      <Link
        href="/admin/revendedores"
        className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 hover:text-[#1A1A2E]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar para revendedores
      </Link>

      <ResellerProfile id={id} />

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <ResellerPaymentHistory />
          <ResellerPolicyConfig />
        </div>
        <div className="space-y-6">
          <ResellerStudentCount />
          <ResellerActionButtons />
        </div>
      </div>
    </div>
  )
}
