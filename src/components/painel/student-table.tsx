"use client"

import { Eye, Ban, Unlock } from "lucide-react"

interface Student {
  id: string
  nome: string
  email: string
  cursos: number
  matricula: string
  status: "Ativo" | "Bloqueado" | "Inativo"
}

const students: Student[] = [
  { id: "1", nome: "Marina Costa", email: "marina@email.com", cursos: 3, matricula: "14/03/2026", status: "Ativo" },
  { id: "2", nome: "Pedro Almeida", email: "pedro@email.com", cursos: 2, matricula: "12/03/2026", status: "Ativo" },
  { id: "3", nome: "Juliana Ramos", email: "juliana@email.com", cursos: 1, matricula: "11/03/2026", status: "Ativo" },
  { id: "4", nome: "Rafael Lima", email: "rafael@email.com", cursos: 4, matricula: "09/03/2026", status: "Bloqueado" },
  { id: "5", nome: "Carla Mendes", email: "carla@email.com", cursos: 2, matricula: "08/03/2026", status: "Ativo" },
  { id: "6", nome: "Bruno Souza", email: "bruno@email.com", cursos: 1, matricula: "07/03/2026", status: "Inativo" },
  { id: "7", nome: "Fernanda Dias", email: "fernanda@email.com", cursos: 3, matricula: "05/03/2026", status: "Ativo" },
  { id: "8", nome: "Lucas Oliveira", email: "lucas.o@email.com", cursos: 2, matricula: "04/03/2026", status: "Ativo" },
  { id: "9", nome: "Amanda Reis", email: "amanda@email.com", cursos: 1, matricula: "02/03/2026", status: "Bloqueado" },
  { id: "10", nome: "Diego Martins", email: "diego@email.com", cursos: 2, matricula: "01/03/2026", status: "Ativo" },
  { id: "11", nome: "Patrícia Alves", email: "patricia@email.com", cursos: 1, matricula: "27/02/2026", status: "Ativo" },
  { id: "12", nome: "Tiago Ferreira", email: "tiago@email.com", cursos: 5, matricula: "25/02/2026", status: "Ativo" },
  { id: "13", nome: "Vanessa Pires", email: "vanessa@email.com", cursos: 2, matricula: "22/02/2026", status: "Inativo" },
  { id: "14", nome: "Henrique Gomes", email: "henrique@email.com", cursos: 3, matricula: "20/02/2026", status: "Ativo" },
  { id: "15", nome: "Beatriz Cardoso", email: "beatriz@email.com", cursos: 1, matricula: "18/02/2026", status: "Ativo" },
]

const statusColors: Record<Student["status"], string> = {
  Ativo: "bg-green-100 text-green-700",
  Bloqueado: "bg-red-100 text-red-700",
  Inativo: "bg-gray-100 text-gray-600",
}

interface StudentTableProps {
  onViewDetails: (studentId: string) => void
}

export function StudentTable({ onViewDetails }: StudentTableProps) {
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
            {students.map((student) => (
              <tr key={student.id} className="hover:bg-gray-50/60">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-[10px] font-semibold text-blue-700">
                      {student.nome
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)}
                    </div>
                    <span className="text-sm font-medium text-[#1A1A2E]">
                      {student.nome}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {student.email}
                </td>
                <td className="px-4 py-3 font-mono text-sm text-gray-700">
                  {student.cursos}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {student.matricula}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      statusColors[student.status]
                    }`}
                  >
                    {student.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => onViewDetails(student.id)}
                      className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600"
                      title="Ver detalhes"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className={`rounded-md p-1.5 hover:bg-gray-100 ${
                        student.status === "Bloqueado"
                          ? "text-green-600"
                          : "text-gray-500 hover:text-red-600"
                      }`}
                      title={
                        student.status === "Bloqueado"
                          ? "Desbloquear"
                          : "Bloquear"
                      }
                    >
                      {student.status === "Bloqueado" ? (
                        <Unlock className="h-4 w-4" />
                      ) : (
                        <Ban className="h-4 w-4" />
                      )}
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
