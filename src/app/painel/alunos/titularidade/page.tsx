import { PageHeader } from "@/components/painel/page-header"
import { requirePainelPage } from "@/lib/auth/painel-guard"
import { TitularityReviewQueue } from "@/components/shared/titularidade/review-queue"

export const dynamic = "force-dynamic"

/**
 * Revisão de titularidade da unidade. A unidade faz isso, e não a PMB, porque é
 * ela que conhece a família e tem o documento do aluno em mãos.
 */
export default async function PainelTitularidadePage() {
  await requirePainelPage("alunos.view")
  return (
    <div className="space-y-6">
      <PageHeader
        title="Revisão de titularidade"
        description="Alunos que podem ter sido cadastrados com o nome do responsável — o que faz o certificado sair no nome errado."
      />
      <TitularityReviewQueue
        listEndpoint="/api/painel/titularidade"
        applyEndpoint="/api/painel/alunos/:id/titularidade"
      />
    </div>
  )
}
