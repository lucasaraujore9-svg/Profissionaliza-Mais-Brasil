import { PageHeader } from "@/components/painel/page-header"
import { CertificateIssueForm } from "@/components/painel/certificate-issue-form"

export const dynamic = "force-dynamic"

export default function PainelCertificadosEmitirPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Emitir certificado"
        description="Selecione o aluno e a matrícula para gerar manualmente um certificado."
      />

      <CertificateIssueForm
        studentSearchEndpoint="/api/painel/alunos"
        enrollmentsEndpoint="/api/painel/certificates/enrollments"
        issueEndpoint="/api/painel/certificates/issue"
        successHref="/painel/certificados/emitidos"
        canForce={false}
      />
    </div>
  )
}
