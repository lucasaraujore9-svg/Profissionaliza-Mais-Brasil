import { PageHeader } from "@/components/painel/page-header"
import { StudentListWrapper } from "@/components/painel/student-list-wrapper"
import { requirePainelPage } from "@/lib/auth/painel-guard"

export default async function PainelAlunosPage() {
  await requirePainelPage("alunos.view")

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alunos"
        description="Visualize e gerencie quem está estudando através da sua vitrine."
      />
      <StudentListWrapper />
    </div>
  )
}
