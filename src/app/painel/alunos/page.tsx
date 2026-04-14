import { PageHeader } from "@/components/painel/page-header"
import { StudentListWrapper } from "@/components/painel/student-list-wrapper"

export default function PainelAlunosPage() {
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
