import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { PageHeader } from "@/components/painel/page-header"
import { VitrineEditor } from "@/components/painel/vitrine-editor"
import { BannerSlidesManager } from "@/components/shared/banner-slides-manager"
import { VitrineTabsShell } from "@/components/vitrine/tabs-shell"
import { HomeSectionsPanel } from "@/components/vitrine/home-sections-panel"
import { activeCustomDomain, vitrineUrl } from "@/lib/tenant/urls"

export default async function PainelVitrinePage() {
  // Best-effort: link de preview da vitrine do revendedor logado.
  let previewUrl: string | null = null
  try {
    const session = await requireResellerSession()
    if (session) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: session.tenantId },
        select: { slug: true, customDomain: true, domainVerified: true },
      })
      const appliedDomain = tenant ? activeCustomDomain(tenant) : null
      if (appliedDomain) {
        previewUrl = `https://${appliedDomain}`
      } else if (tenant?.slug) {
        previewUrl = vitrineUrl(tenant.slug)
      }
    }
  } catch {
    // ignora — botão de preview é cosmético.
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Minha vitrine"
        description="Personalize sua loja em poucos cliques. Cada aba é uma área independente — banner principal, seções da home e identidade visual."
      />

      <VitrineTabsShell
        previewUrl={previewUrl}
        tabs={[
          {
            value: "banner",
            label: "Banner principal",
            content: (
              <BannerSlidesManager
                apiBase="/api/painel/banner"
                title="Banner principal da vitrine"
                description="Adicione uma imagem única ou múltiplos slides. Cada slide precisa de versão desktop (1920×600px) e mobile (1080×1080px)."
              />
            ),
          },
          {
            value: "secoes",
            label: "Seções da home",
            content: (
              <HomeSectionsPanel
                apiBase="/api/painel/home-sections"
                hint="A primeira seção (“Cursos mais vendidos da semana”) é fixa. As outras você pode ligar, desligar, reordenar e personalizar — toda categoria nova aparece aqui automaticamente, desativada, esperando você ativar."
              />
            ),
          },
          {
            value: "personalizacao",
            label: "Personalização",
            content: <VitrineEditor />,
          },
        ]}
      />
    </div>
  )
}
