import { redirect } from "next/navigation"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { prisma } from "@/lib/prisma"
import { PageHeader } from "@/components/painel/page-header"
import { CertificateIssueForm } from "@/components/painel/certificate-issue-form"
import { DEFAULT_CERTIFICATE_MIN_PERCENT } from "@/lib/certificates/eligibility"

export const dynamic = "force-dynamic"

export default async function AdminCertificadosEmitirPage() {
  const ctx = await requireAdminSession()
  if (!ctx) redirect("/login?callbackUrl=/admin/certificados/emitir")

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
        canForce={ctx.role === "SUPER_ADMIN"}
        minPercent={minPercent}
      />
    </div>
  )
}
