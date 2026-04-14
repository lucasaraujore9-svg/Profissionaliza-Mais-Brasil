import { PageHeader } from "@/components/painel/page-header"
import { VitrineEditor } from "@/components/painel/vitrine-editor"

export default function PainelVitrinePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Minha vitrine"
        description="Personalize a identidade visual da sua loja. O preview atualiza em tempo real."
      />

      <VitrineEditor />
    </div>
  )
}
