import { prisma } from "@/lib/prisma"
import { PageHeader } from "@/components/painel/page-header"
import { CertificateIssueForm } from "@/components/painel/certificate-issue-form"
import { DEFAULT_CERTIFICATE_MIN_PERCENT } from "@/lib/certificates/eligibility"
import { requirePainelPage } from "@/lib/auth/painel-guard"

export const dynamic = "force-dynamic"

export default async function PainelCertificadosEmitirPage() {
  await requirePainelPage("certificados.manage")

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
        description="Selecione o aluno e a matrícula para gerar manualmente um certificado."
      />

      <CertificateIssueForm
        studentSearchEndpoint="/api/painel/alunos"
        enrollmentsEndpoint="/api/painel/certificates/enrollments"
        issueEndpoint="/api/painel/certificates/issue"
        successHref="/painel/certificados/emitidos"
        canForce={false}
        minPercent={minPercent}
      />
    </div>
  )
}
