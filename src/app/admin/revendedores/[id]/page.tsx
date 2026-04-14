import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { ResellerDetailClient } from "@/components/admin/reseller-detail-client"

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

      <ResellerDetailClient tenantId={id} />
    </div>
  )
}
