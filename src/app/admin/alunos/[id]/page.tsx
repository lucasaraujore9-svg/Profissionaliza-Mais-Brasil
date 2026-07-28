import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { loadStudentDetail } from "@/lib/students/load-detail"
import { studentStatusLabel } from "@/lib/labels"
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

export default async function AdminStudentDetailPage({ params }: PageProps) {
  const session = await requireAdminSession()
  if (!session) redirect("/login?callbackUrl=/admin/alunos")
  // requireAdminSession ja garante que e do time PMB (SUPER_ADMIN, PMB_SALES,
  // PMB_RESELLER_MGR). Os tres podem acessar o detalhe; APIs ja se autorizam
  // individualmente.

  const { id } = await params
  const student = await loadStudentDetail({ studentId: id })
  if (!student) notFound()

  return (
    <div className="space-y-6">
      <Link
        href="/admin/alunos"
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
              {studentStatusLabel(student.status)}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            {student.email ?? "Sem email"} ·{" "}
            <span className="font-medium">{student.tenantName}</span>
          </p>
        </div>
      </div>

      <StudentManagement
        student={student}
        scope={{ kind: "admin", canEdit: true, canResetPassword: true }}
        currentUserId={session.userId}
      />
    </div>
  )
}
