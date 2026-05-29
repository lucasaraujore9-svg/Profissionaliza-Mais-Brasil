import { redirect } from "next/navigation"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { PageHeader } from "@/components/painel/page-header"
import { CertificateIssueForm } from "@/components/painel/certificate-issue-form"

export const dynamic = "force-dynamic"

export default async function AdminCertificadosEmitirPage() {
  const ctx = await requireAdminSession()
  if (!ctx) redirect("/login?callbackUrl=/admin/certificados/emitir")

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
      />
    </div>
  )
}
