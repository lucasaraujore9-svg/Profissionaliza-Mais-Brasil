"use client"

import { Pencil, Trash2, Eye, EyeOff } from "lucide-react"
import { formatCurrency } from "@/lib/utils"

export interface CourseListItem {
  id: string
  courseId: string
  title: string
  description: string | null
  capaImageUrl: string | null
  qtdAulas: number
  cargaHoraria: string | null
  price: number
  paymentType: "ONE_TIME" | "MONTHLY"
  isVisible: boolean
  isFeatured: boolean
  customOrder: number
  enrollmentsCount: number
}

interface CourseListTableProps {
  courses: CourseListItem[]
  onEdit: (courseId: string) => void
  onToggleVisibility: (courseId: string, next: boolean) => void
  onDelete: (courseId: string) => void
}

export function CourseListTable({
  courses,
  onEdit,
  onToggleVisibility,
  onDelete,
}: CourseListTableProps) {
  if (courses.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
        Nenhum curso encontrado.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Título</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Matrículas</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Preço</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Tipo</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Visibilidade</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {courses.map((course) => (
              <tr key={course.id} className="hover:bg-gray-50/60">
                <td className="max-w-xs truncate px-4 py-3 text-sm font-medium text-[var(--color-pmb-green-900)]">
                  {course.title}
                </td>
                <td className="px-4 py-3 font-mono text-sm text-gray-700">
                  {course.enrollmentsCount}
                </td>
                <td className="px-4 py-3 font-mono text-sm font-semibold text-[var(--color-pmb-green-900)]">
                  {formatCurrency(course.price)}
                </td>
                <td className="px-4 py-3 text-sm">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      course.paymentType === "MONTHLY"
                        ? "bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green-700)]"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {course.paymentType === "MONTHLY" ? "Recorrente" : "Único"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() =>
                      onToggleVisibility(course.id, !course.isVisible)
                    }
                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      course.isVisible
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {course.isVisible ? (
                      <Eye className="h-3 w-3" />
                    ) : (
                      <EyeOff className="h-3 w-3" />
                    )}
                    {course.isVisible ? "Visível" : "Oculto"}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => onEdit(course.id)}
                      className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-[var(--color-pmb-green)]"
                      title="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(course.id)}
                      className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-600"
                      title="Remover"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
