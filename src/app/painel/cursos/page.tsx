import { Plus } from "lucide-react"
import { PageHeader } from "@/components/painel/page-header"
import { Button } from "@/components/ui/button"
import { CourseListToolbar } from "@/components/painel/course-list-toolbar"
import { CourseListWrapper } from "@/components/painel/course-list-wrapper"

export default function PainelCursosPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Meus cursos"
        description="Edite, oculte ou duplique os cursos do seu catálogo."
        actions={
          <Button className="bg-blue-600 text-white hover:bg-blue-700">
            <Plus className="mr-2 h-4 w-4" />
            Novo curso
          </Button>
        }
      />

      <CourseListToolbar />
      <CourseListWrapper />
    </div>
  )
}
