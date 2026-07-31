"use client"

import Link from "next/link"
import { Eye, Ban, Unlock, ChevronUp, ChevronDown, ChevronsUpDown, Users } from "lucide-react"
import { EmptyState } from "@/components/shared/empty-state"
import { TableRowsSkeleton } from "@/components/shared/loading-skeletons"
import { StudentStatusBadge, type StudentStatusKey } from "./student-status"
import { useCan } from "@/components/shared/permissions/permission-context"

// Status canonicos do aluno — fonte unica de verdade em ./student-status.
export type StudentStatus = StudentStatusKey

export interface StudentListItem {
  id: string
  nome: string
  email: string
  status: StudentStatus
  coursesCount: number
  createdAt: string
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

export type SortKey = "nome" | "email" | "coursesCount" | "createdAt" | "status"
export type SortOrder = "asc" | "desc"

const columns: { key: SortKey; label: string; align?: "left" | "right" }[] = [
  { key: "nome", label: "Nome" },
  { key: "email", label: "Email" },
  { key: "coursesCount", label: "Cursos" },
  { key: "createdAt", label: "Matrícula" },
  { key: "status", label: "Status" },
]

interface StudentTableProps {
  students: StudentListItem[]
  loading?: boolean
  pendingId?: string | null
  sortKey: SortKey
  sortOrder: SortOrder
  onSort: (key: SortKey) => void
  onViewDetails: (studentId: string) => void
  onToggleBlock: (student: StudentListItem) => void
}

export function StudentTable({
  students,
  loading,
  pendingId,
  sortKey,
  sortOrder,
  onSort,
  onViewDetails,
  onToggleBlock,
}: StudentTableProps) {
  const canManage = useCan("alunos.manage")

  if (loading) {
    return (
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <TableRowsSkeleton rows={6} cols={6} />
      </div>
    )
  }

  if (students.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Nenhum aluno encontrado"
        description="Ajuste os filtros ou aguarde a primeira matrícula pela sua vitrine."
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((col) => {
                const active = sortKey === col.key
                return (
                  <th
                    key={col.key}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600"
                  >
                    <button
                      type="button"
                      onClick={() => onSort(col.key)}
                      className={`group inline-flex items-center gap-1 transition-colors hover:text-[var(--color-pmb-green-900)] ${
                        active ? "text-[var(--color-pmb-green-900)]" : ""
                      }`}
                      title={`Ordenar por ${col.label}`}
                    >
                      {col.label}
                      {active ? (
                        sortOrder === "asc" ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )
                      ) : (
                        <ChevronsUpDown className="h-3.5 w-3.5 text-gray-300 group-hover:text-gray-400" />
                      )}
                    </button>
                  </th>
                )
              })}
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
                    <StudentStatusBadge status={student.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onViewDetails(student.id)}
                        className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-[var(--color-pmb-green)]"
                        aria-label="Ver detalhes"
                        title="Ver detalhes"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      {/* Bloquear/desbloquear é `alunos.manage`. O Financeiro da
                          unidade lê a carteira para conciliar e não mexe no
                          acesso do aluno. */}
                      {canManage && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => onToggleBlock(student)}
                          className={`rounded-md p-1.5 hover:bg-gray-100 disabled:opacity-50 ${
                            isBlocked ? "text-green-600" : "text-gray-500 hover:text-red-600"
                          }`}
                          aria-label={isBlocked ? "Desbloquear aluno" : "Bloquear aluno"}
                          title={isBlocked ? "Desbloquear" : "Bloquear"}
                        >
                          {isBlocked ? <Unlock className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                        </button>
                      )}
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
