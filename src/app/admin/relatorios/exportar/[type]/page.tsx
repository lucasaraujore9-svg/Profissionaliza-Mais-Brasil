import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { requireAdminPage } from "@/lib/auth/admin-guard"
import { ReportViewer } from "@/components/admin/report-viewer"

// Viewer de exportação CSV (antes em `relatorios/[type]`). Realocado para
// `exportar/[type]` para liberar o segmento `[tab]` do hub de BI.
export default async function ReportViewerPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string }>
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  await requireAdminPage("relatorios.export")

  const { type } = await params
  const { from, to } = await searchParams

  return (
    <div className="space-y-6">
      <Link
        href="/admin/relatorios/exportacoes"
        className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 hover:text-[var(--color-pmb-green-900)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar aos relatórios
      </Link>
      <ReportViewer type={type} from={from ?? null} to={to ?? null} />
    </div>
  )
}
