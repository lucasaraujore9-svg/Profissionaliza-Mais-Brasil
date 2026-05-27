import { redirect } from "next/navigation"
import { PageHeader } from "@/components/painel/page-header"
import { BannerSlidesManager } from "@/components/shared/banner-slides-manager"
import { VitrineTabsShell } from "@/components/vitrine/tabs-shell"
import { HomeSectionsPanel } from "@/components/vitrine/home-sections-panel"
import { requireSuperAdmin } from "@/lib/auth/guards"
import { appUrl } from "@/lib/tenant/urls"

export default async function AdminVitrinePage() {
  const guard = await requireSuperAdmin()
  if (!guard.ok) {
    redirect("/admin")
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vitrine principal"
        description="Personalize a home do site PMB. Cada aba é uma área de edição independente — pode ativar e desativar peças sem mexer no resto."
      />

      <VitrineTabsShell
        previewUrl={appUrl()}
        tabs={[
          {
            value: "banner",
            label: "Banner principal",
            content: (
              <BannerSlidesManager
                apiBase="/api/admin/banner"
                title="Banner principal"
                description="Adicione uma imagem única ou múltiplos slides (carrossel). Cada slide precisa de versão desktop (1920×600px) e mobile (1080×1080px)."
              />
            ),
          },
          {
            value: "secoes",
            label: "Seções da home",
            content: (
              <HomeSectionsPanel
                apiBase="/api/admin/home-sections"
                hint="A primeira seção (“Cursos mais vendidos da semana”) é fixa e sempre aparece. As outras você pode ligar, desligar, reordenar e personalizar."
              />
            ),
          },
        ]}
      />
    </div>
  )
}
