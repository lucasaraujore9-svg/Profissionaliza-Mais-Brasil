import Link from "next/link"
import { Plus } from "lucide-react"
import { PageHeader } from "@/components/painel/page-header"
import { CertificatesList } from "@/components/painel/certificates-list"

export const dynamic = "force-dynamic"

export default function PainelCertificadosEmitidosPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Certificados emitidos"
        description="Histórico completo de certificados gerados para seus alunos."
        actions={
          <Link
            href="/painel/certificados/emitir"
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-pmb-green-700)]"
          >
            <Plus className="h-4 w-4" />
            Emitir certificado
          </Link>
        }
      />

      <CertificatesList
        listEndpoint="/api/painel/certificates"
        revokeEndpoint={(id) => `/api/painel/certificates/${id}/revoke`}
      />
    </div>
  )
}
