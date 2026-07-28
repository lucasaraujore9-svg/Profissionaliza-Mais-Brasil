import { notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { requirePainelPage } from "@/lib/auth/painel-guard"
import { loadStudentDetail } from "@/lib/students/load-detail"
import { PageHeader } from "@/components/painel/page-header"
import { StudentStatusBadge } from "@/components/painel/student-status"
import { StudentManagement } from "@/components/shared/student-management"

export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function PainelStudentDetailPage({ params }: PageProps) {
  const session = await requirePainelPage("alunos.view")

  const { id } = await params
  // Filtra por tenantId (isolamento entre unidades) e pelo escopo do papel —
  // sem `alunos.viewAll`, abrir o ID de um aluno de outro vendedor dá 404.
  const student = await loadStudentDetail({
    studentId: id,
    tenantId: session.tenantId,
    scope: session.scope.alunos,
  })
  if (!student) notFound()

  return (
    <div className="space-y-6">
      <Link
        href="/painel/alunos"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[var(--color-pmb-green-900)]"
      >
        <ChevronLeft className="h-4 w-4" />
        Voltar para alunos
      </Link>

      <PageHeader
        title={student.nome}
        description={student.email ?? "Sem email"}
        actions={<StudentStatusBadge status={student.status} />}
      />

      <StudentManagement
        student={student}
        scope={{ kind: "painel" }}
        currentUserId={session.userId}
      />
    </div>
  )
}
