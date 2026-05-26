import { PageHeader } from "@/components/painel/page-header"
import { BannerSlidesManager } from "@/components/shared/banner-slides-manager"
import { HomeSectionsManager } from "@/components/shared/home-sections-manager"
import { requireSuperAdmin } from "@/lib/auth/guards"
import { redirect } from "next/navigation"

export default async function AdminVitrinePage() {
  const guard = await requireSuperAdmin()
  if (!guard.ok) {
    redirect("/admin")
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vitrine principal"
        description="Personalização do site PMB (profissionalizamaisbrasil.com.br). Todos os ajustes visuais da home ficam aqui."
      />

      <BannerSlidesManager
        apiBase="/api/admin/banner"
        title="Banner principal"
        description="Adicione uma imagem única ou múltiplos slides (carrossel). Cada slide precisa de desktop (1920×600px) e mobile (1080×1080px). Enquanto houver pelo menos 1 slide ativo, a hero exibe só a imagem (sem headline ou busca por cima)."
      />

      <HomeSectionsManager
        apiBase="/api/admin/home-sections"
        title="Seções de cursos da home"
        description="Configure as seções de cursos do site PMB: ordem, modo (manual/aleatório), quantidade (4 ou 8 cursos) e cursos exibidos. “Os cursos mais vendidos da semana” é a primeira seção e não pode ser desativada."
      />
    </div>
  )
}
