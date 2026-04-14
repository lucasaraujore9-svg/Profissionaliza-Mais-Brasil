"use client"

import { useState } from "react"
import { Pencil, Copy, Trash2, Eye, EyeOff } from "lucide-react"

interface Course {
  id: string
  titulo: string
  alunos: number
  preco: string
  tipo: "Único" | "Recorrente"
  status: "Ativo" | "Oculto"
}

const initialCourses: Course[] = [
  { id: "1", titulo: "Excel Avançado — Do Zero ao PROCV", alunos: 342, preco: "R$ 267,00", tipo: "Único", status: "Ativo" },
  { id: "2", titulo: "Marketing Digital Completo", alunos: 281, preco: "R$ 397,00", tipo: "Único", status: "Ativo" },
  { id: "3", titulo: "Design Gráfico para Iniciantes", alunos: 195, preco: "R$ 347,00", tipo: "Único", status: "Ativo" },
  { id: "4", titulo: "Power BI — Dashboards Profissionais", alunos: 178, preco: "R$ 497,00", tipo: "Único", status: "Ativo" },
  { id: "5", titulo: "Inglês Profissional para Trabalho", alunos: 166, preco: "R$ 59,90", tipo: "Recorrente", status: "Ativo" },
  { id: "6", titulo: "Gestão de Projetos Ágeis", alunos: 142, preco: "R$ 447,00", tipo: "Único", status: "Ativo" },
  { id: "7", titulo: "Copywriting Persuasivo", alunos: 98, preco: "R$ 297,00", tipo: "Único", status: "Oculto" },
  { id: "8", titulo: "Programação Python do Zero", alunos: 87, preco: "R$ 597,00", tipo: "Único", status: "Ativo" },
  { id: "9", titulo: "Maquiagem Profissional", alunos: 64, preco: "R$ 397,00", tipo: "Único", status: "Oculto" },
  { id: "10", titulo: "Oratória e Apresentações", alunos: 52, preco: "R$ 247,00", tipo: "Único", status: "Ativo" },
]

interface CourseListTableProps {
  onEdit: (courseId: string) => void
}

export function CourseListTable({ onEdit }: CourseListTableProps) {
  const [courses, setCourses] = useState(initialCourses)

  const toggleStatus = (id: string) => {
    setCourses((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, status: c.status === "Ativo" ? "Oculto" : "Ativo" }
          : c,
      ),
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Título</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Alunos</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Preço</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Tipo</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Status</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {courses.map((course) => (
              <tr key={course.id} className="hover:bg-gray-50/60">
                <td className="max-w-xs truncate px-4 py-3 text-sm font-medium text-[#1A1A2E]">
                  {course.titulo}
                </td>
                <td className="px-4 py-3 font-mono text-sm text-gray-700">
                  {course.alunos}
                </td>
                <td className="px-4 py-3 font-mono text-sm font-semibold text-[#1A1A2E]">
                  {course.preco}
                </td>
                <td className="px-4 py-3 text-sm">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      course.tipo === "Recorrente"
                        ? "bg-indigo-100 text-indigo-700"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {course.tipo}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleStatus(course.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      course.status === "Ativo"
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {course.status === "Ativo" ? (
                      <Eye className="h-3 w-3" />
                    ) : (
                      <EyeOff className="h-3 w-3" />
                    )}
                    {course.status}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => onEdit(course.id)}
                      className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600"
                      title="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-[#1A1A2E]"
                      title="Duplicar"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
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
