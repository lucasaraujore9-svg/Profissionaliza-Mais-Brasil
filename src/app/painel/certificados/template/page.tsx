import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PageHeader } from "@/components/painel/page-header"
import { CertificateLayoutSelector } from "@/components/painel/certificate-layout-selector"

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

  const [tenant, template] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, logoUrl: true },
    }),
    prisma.certificateTemplate.findUnique({
      where: { tenantId },
      select: { layout: true },
    }),
  ])

  const initialLayout = template?.layout ?? "CLASSIC"

  return (
    <div className="space-y-6">
      <PageHeader
        title="Layout do certificado"
        description="Escolha entre os layouts disponiveis. A logo, o texto e as cores sao padronizados — a logo e puxada automaticamente da sua escola."
      />

      <CertificateLayoutSelector
        initialLayout={initialLayout}
        tenantLogoUrl={tenant?.logoUrl ?? null}
        tenantName={tenant?.name ?? "sua escola"}
      />
    </div>
  )
}
