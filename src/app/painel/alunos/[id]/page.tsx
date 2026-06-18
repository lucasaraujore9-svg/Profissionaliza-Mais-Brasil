import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { loadStudentDetail } from "@/lib/students/load-detail"
import { PageHeader } from "@/components/painel/page-header"
import { StudentStatusBadge } from "@/components/painel/student-status"
import { StudentManagement } from "@/components/shared/student-management"

export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function PainelStudentDetailPage({ params }: PageProps) {
  const session = await requireResellerSession()
  if (!session) redirect("/login?callbackUrl=/painel/alunos")

  const { id } = await params
  // Filtra por tenantId — revendedor só vê alunos do próprio tenant.
  const student = await loadStudentDetail({
    studentId: id,
    tenantId: session.tenantId,
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
