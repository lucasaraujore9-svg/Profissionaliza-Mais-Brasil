import { requireAdminPage } from "@/lib/auth/admin-guard"
import { prisma } from "@/lib/prisma"
import { PageHeader } from "@/components/painel/page-header"
import { CertificateIssueForm } from "@/components/painel/certificate-issue-form"
import { DEFAULT_CERTIFICATE_MIN_PERCENT } from "@/lib/certificates/eligibility"

export const dynamic = "force-dynamic"

export default async function AdminCertificadosEmitirPage() {
  const ctx = await requireAdminPage("certificados.manage")

  const settings = await prisma.systemSettings.findUnique({
    where: { id: "default" },
    select: { certificateMinPercent: true },
  })
  const minPercent =
    settings?.certificateMinPercent ?? DEFAULT_CERTIFICATE_MIN_PERCENT

  return (
    <div className="space-y-6">
      <PageHeader
        title="Emitir certificado"
        description="Emissão manual para alunos de qualquer tenant ou da vitrine PMB."
      />

      <CertificateIssueForm
        studentSearchEndpoint="/api/admin/alunos/global"
        enrollmentsEndpoint="/api/admin/certificates/enrollments"
        issueEndpoint="/api/admin/certificates/issue"
        successHref="/admin/certificados"
        showTenantContext
        canForce={ctx.can("unidades.viewAll")}
        minPercent={minPercent}
      />
    </div>
  )
}
