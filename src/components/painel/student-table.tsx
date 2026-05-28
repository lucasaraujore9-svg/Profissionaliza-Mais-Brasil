"use client"

import Link from "next/link"
import { Eye, Ban, Unlock } from "lucide-react"

export type StudentStatus =
  | "ATIVO"
  | "INATIVO"
  | "BLOQUEADO"
  | "DEVEDOR"
  | "FORMADO"
  | "INTERESSADO"

export interface StudentListItem {
  id: string
  nome: string
  email: string
  status: StudentStatus
  coursesCount: number
  createdAt: string
}

const statusLabels: Record<StudentStatus, string> = {
  ATIVO: "Ativo",
  INATIVO: "Inativo",
  BLOQUEADO: "Bloqueado",
  DEVEDOR: "Devedor",
  FORMADO: "Formado",
  INTERESSADO: "Interessado",
}

const statusColors: Record<StudentStatus, string> = {
  ATIVO: "bg-green-100 text-green-700",
  INATIVO: "bg-gray-100 text-gray-600",
  BLOQUEADO: "bg-red-100 text-red-700",
  DEVEDOR: "bg-amber-100 text-amber-700",
  FORMADO: "bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green-700)]",
  INTERESSADO: "bg-violet-100 text-violet-700",
}

function formatDate(iso: string): string {
  try {
    const date = new Date(iso)
    return date.toLocaleDateString("pt-BR")
  } catch {
    return "—"
  }
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

interface StudentTableProps {
  students: StudentListItem[]
  loading?: boolean
  pendingId?: string | null
  onViewDetails: (studentId: string) => void
  onToggleBlock: (student: StudentListItem) => void
}

export function StudentTable({
  students,
  loading,
  pendingId,
  onViewDetails,
  onToggleBlock,
}: StudentTableProps) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
        Carregando alunos...
      </div>
    )
  }

  if (students.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
        Nenhum aluno encontrado.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Nome</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Email</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Cursos</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Matrícula</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Status</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {students.map((student) => {
              const isBlocked = student.status === "BLOQUEADO"
              const isPending = pendingId === student.id
              return (
                <tr key={student.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3">
                    <Link
                      href={`/painel/alunos/${student.id}`}
                      className="flex items-center gap-3 hover:text-[var(--color-pmb-green)]"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-pmb-lime-50)] text-[10px] font-semibold text-[var(--color-pmb-green-700)]">
                        {initials(student.nome)}
                      </div>
                      <span className="text-sm font-medium text-[var(--color-pmb-green-900)] hover:underline">
                        {student.nome}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{student.email}</td>
                  <td className="px-4 py-3 font-mono text-sm text-gray-700">
                    {student.coursesCount}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatDate(student.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColors[student.status]}`}
                    >
                      {statusLabels[student.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onViewDetails(student.id)}
                        className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-[var(--color-pmb-green)]"
                        title="Ver detalhes"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => onToggleBlock(student)}
                        className={`rounded-md p-1.5 hover:bg-gray-100 disabled:opacity-50 ${
                          isBlocked ? "text-green-600" : "text-gray-500 hover:text-red-600"
                        }`}
                        title={isBlocked ? "Desbloquear" : "Bloquear"}
                      >
                        {isBlocked ? <Unlock className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
