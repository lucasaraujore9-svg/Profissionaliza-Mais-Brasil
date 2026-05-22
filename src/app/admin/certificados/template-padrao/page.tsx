import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { PageHeader } from "@/components/painel/page-header"
import {
  CertificateTemplateEditor,
  type CertificateTemplateData,
} from "@/components/painel/certificate-template-editor"

export const dynamic = "force-dynamic"

export default async function AdminCertificadosTemplatePadraoPage() {
  const ctx = await requireAdminSession()
  if (!ctx || ctx.role !== "SUPER_ADMIN") {
    redirect("/admin/certificados")
  }

  const template = await prisma.certificateTemplate.findFirst({
    where: { tenantId: null },
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
        title="Template padrão Profissionaliza Mais Brasil"
        description="Layout usado na vitrine PMB e como fallback para revendedores sem template próprio."
      />

      <CertificateTemplateEditor
        initial={initial}
        saveEndpoint="/api/admin/certificate-template"
        uploadEndpoint="/api/admin/certificate-template/upload"
        scopeLabel="Template padrão PMB (vitrine própria)"
      />
    </div>
  )
}
