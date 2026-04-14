import { Download } from "lucide-react"
import { PageHeader } from "@/components/painel/page-header"
import { Button } from "@/components/ui/button"
import { StudentStatsBar } from "@/components/painel/student-stats-bar"
import { StudentToolbar } from "@/components/painel/student-toolbar"
import { StudentListWrapper } from "@/components/painel/student-list-wrapper"

export default function PainelAlunosPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Alunos"
        description="Visualize e gerencie quem está estudando através da sua vitrine."
        actions={
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Exportar
          </Button>
        }
      />

      <StudentStatsBar />
      <StudentToolbar />
      <StudentListWrapper />
    </div>
  )
}
