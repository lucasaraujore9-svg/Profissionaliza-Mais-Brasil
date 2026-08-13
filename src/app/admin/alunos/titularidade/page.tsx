import { PageHeader } from "@/components/painel/page-header"
import { requireAdminPage } from "@/lib/auth/admin-guard"
import { TitularityReviewQueue } from "@/components/shared/titularidade/review-queue"

export const dynamic = "force-dynamic"

/**
 * Revisão de titularidade — encontra cadastros em que o "aluno" é, na verdade,
 * o responsável (quase sempre a mãe), porque até agora vender para um menor
 * exigia cadastrá-la como se fosse a aluna. O certificado saía no nome dela.
 */
export default async function AdminTitularidadePage() {
  await requireAdminPage("alunosRede.view")
  return (
    <div className="space-y-6">
      <PageHeader
        title="Revisão de titularidade"
        description="Cadastros em que o aluno pode ter sido registrado com o nome do responsável — o que faz o certificado sair no nome errado."
      />
      <TitularityReviewQueue
        listEndpoint="/api/admin/titularidade"
        applyEndpoint="/api/admin/alunos/:id/titularidade"
        showTenant
      />
    </div>
  )
}
