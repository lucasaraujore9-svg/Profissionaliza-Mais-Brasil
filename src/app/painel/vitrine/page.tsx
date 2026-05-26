import { PageHeader } from "@/components/painel/page-header"
import { VitrineEditor } from "@/components/painel/vitrine-editor"
import { BannerSlidesManager } from "@/components/shared/banner-slides-manager"
import { HomeSectionsManager } from "@/components/shared/home-sections-manager"

export default function PainelVitrinePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Minha vitrine"
        description="Personalize a identidade visual da sua loja. O preview atualiza em tempo real."
      />

      <BannerSlidesManager
        apiBase="/api/painel/banner"
        title="Banner principal da vitrine"
        description="Adicione uma imagem única ou múltiplos slides. Cada slide precisa de versão desktop (1920×600px) e mobile (1080×1080px). Enquanto houver pelo menos 1 slide ativo, a hero exibe só a imagem (sem headline ou busca por cima)."
      />

      <HomeSectionsManager
        apiBase="/api/painel/home-sections"
        title="Seções de cursos da home"
        description="Configure as seções de cursos da sua vitrine: ordem, modo (manual/aleatório), quantidade (4 ou 8 cursos) e cursos exibidos. “Os cursos mais vendidos da semana” é a primeira seção e não pode ser desativada. Sem configuração própria, a vitrine usa o padrão PMB como fallback."
      />

      <VitrineEditor />
    </div>
  )
}
