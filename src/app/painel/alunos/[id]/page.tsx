import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { loadStudentDetail } from "@/lib/students/load-detail"
import { Badge } from "@/components/ui/badge"
import { StudentManagement } from "@/components/shared/student-management"

export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ id: string }>
}

function statusVariant(
  status: string,
): "default" | "outline" | "secondary" | "destructive" {
  if (status === "ATIVO") return "default"
  if (status === "BLOQUEADO") return "destructive"
  if (status === "DEVEDOR" || status === "PENDENTE") return "secondary"
  return "outline"
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-display text-[var(--color-pmb-green-900)] md:text-3xl">
              {student.nome}
            </h1>
            <Badge variant={statusVariant(student.status)}>
              {student.status}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            {student.email ?? "Sem email"}
          </p>
        </div>
      </div>

      <StudentManagement
        student={student}
        scope={{ kind: "painel" }}
        currentUserId={session.userId}
      />
    </div>
  )
}
