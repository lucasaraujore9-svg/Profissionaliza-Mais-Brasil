import { PageHeader } from "@/components/painel/page-header"
import { CourseListWrapper } from "@/components/painel/course-list-wrapper"

export default function PainelCursosPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Catálogo de cursos"
        description="Edite preço, parcelas, descrição, capa, visibilidade e destaque dos cursos da sua vitrine."
      />

      <CourseListWrapper />
    </div>
  )
}
