import { PageHeader } from "@/components/painel/page-header"
import { CourseListWrapper } from "@/components/painel/course-list-wrapper"

export default function PainelCursosPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Meus cursos"
        description="Edite preço, visibilidade e destaque dos cursos na vitrine."
      />

      <CourseListWrapper />
    </div>
  )
}
