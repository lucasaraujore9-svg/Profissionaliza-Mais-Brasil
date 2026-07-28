import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PageHeader } from "@/components/painel/page-header"
import { CertificateLayoutSelector } from "@/components/painel/certificate-layout-selector"
import { resolveCertificateTemplate } from "@/lib/certificates/template-resolver"
import type { CertificateTemplateData } from "@/components/shared/certificate-html-preview"
import { requirePainelPage } from "@/lib/auth/painel-guard"

export const dynamic = "force-dynamic"

export default async function PainelCertificadosTemplatePage() {
  await requirePainelPage("certificados.template")
  const session = await auth()
  const user = session?.user as
    | { id?: string; role?: string; tenantId?: string | null }
    | undefined
  if (!user?.id || user.role !== "RESELLER" || !user.tenantId) {
    redirect("/login?callbackUrl=/painel/certificados/template")
  }

  const tenantId = user.tenantId

  const [tenant, resolved] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, logoUrl: true },
    }),
    // Template resolvido = design herdado do PMB (cores, textos, assinatura)
    // + a logo e o layout escolhido da própria escola. É exatamente o que
    // será emitido, então a prévia é fiel.
    resolveCertificateTemplate(tenantId),
  ])

  const initialLayout = resolved.layout

  // ResolvedTemplate -> shape do componente de prévia (groupLogo/groupName
  // viajam separados; isActive não importa para a prévia).
  const template: CertificateTemplateData = {
    layout: resolved.layout,
    backgroundUrl: resolved.backgroundUrl,
    logoUrl: resolved.logoUrl,
    sealUrl: resolved.sealUrl,
    signatureUrl: resolved.signatureUrl,
    primaryColor: resolved.primaryColor,
    secondaryColor: resolved.secondaryColor,
    titleText: resolved.titleText,
    bodyText: resolved.bodyText,
    footerText: resolved.footerText,
    signerName: resolved.signerName,
    signerTitle: resolved.signerTitle,
    showQrCode: resolved.showQrCode,
    showValidationUrl: resolved.showValidationUrl,
    showSeal: resolved.showSeal,
    isActive: true,
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Layout do certificado"
        description="Escolha entre os layouts disponíveis. A logo, o texto e as cores são padronizados — a logo é puxada automaticamente da sua escola."
      />

      <CertificateLayoutSelector
        initialLayout={initialLayout}
        tenantLogoUrl={tenant?.logoUrl ?? null}
        tenantName={tenant?.name ?? "Sua Escola"}
        template={template}
        groupLogoUrl={resolved.groupLogoUrl}
        groupName={resolved.groupName}
      />
    </div>
  )
}
