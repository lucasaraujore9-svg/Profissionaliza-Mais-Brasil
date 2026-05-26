import { PageHeader } from "@/components/painel/page-header"
import { VitrineEditor } from "@/components/painel/vitrine-editor"
import { BannerSlidesManager } from "@/components/shared/banner-slides-manager"

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

      <VitrineEditor />
    </div>
  )
}
