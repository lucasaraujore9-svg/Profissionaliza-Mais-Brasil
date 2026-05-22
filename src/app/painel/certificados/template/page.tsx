import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PageHeader } from "@/components/painel/page-header"
import {
  CertificateTemplateEditor,
  type CertificateTemplateData,
} from "@/components/painel/certificate-template-editor"

export const dynamic = "force-dynamic"

export default async function PainelCertificadosTemplatePage() {
  const session = await auth()
  const user = session?.user as
    | { id?: string; role?: string; tenantId?: string | null }
    | undefined
  if (!user?.id || user.role !== "RESELLER" || !user.tenantId) {
    redirect("/login?callbackUrl=/painel/certificados/template")
  }

  const tenantId = user.tenantId

  const template = await prisma.certificateTemplate.findUnique({
    where: { tenantId },
  })

  const initial: CertificateTemplateData | null = template
    ? {
        layout: template.layout,
        backgroundUrl: template.backgroundUrl,
        logoUrl: template.logoUrl,
        sealUrl: template.sealUrl,
        signatureUrl: template.signatureUrl,
        primaryColor: template.primaryColor,
        secondaryColor: template.secondaryColor,
        titleText: template.titleText,
        bodyText: template.bodyText,
        footerText: template.footerText,
        signerName: template.signerName,
        signerTitle: template.signerTitle,
        showQrCode: template.showQrCode,
        showValidationUrl: template.showValidationUrl,
        showSeal: template.showSeal,
        isActive: template.isActive,
      }
    : null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Template do certificado"
        description="Edite o layout do certificado que será emitido para os seus alunos."
      />

      <CertificateTemplateEditor
        initial={initial}
        saveEndpoint="/api/painel/certificate-template"
        uploadEndpoint="/api/painel/certificate-template/upload"
        scopeLabel="Template da sua escola"
      />
    </div>
  )
}
