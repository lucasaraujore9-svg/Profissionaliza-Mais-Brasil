"use client"

import { X, Mail, MessageSquare, Ban } from "lucide-react"
import { Button } from "@/components/ui/button"

interface StudentDetailDrawerProps {
  open: boolean
  onClose: () => void
}

const mockCourses = [
  { nome: "Excel Avançado", progresso: 78, data: "14/03/2026" },
  { nome: "Marketing Digital", progresso: 42, data: "03/03/2026" },
  { nome: "Power BI Completo", progresso: 100, data: "12/02/2026" },
]

export function StudentDetailDrawer({
  open,
  onClose,
}: StudentDetailDrawerProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <aside className="relative ml-auto flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-base font-semibold text-[#1A1A2E]">
            Detalhes do aluno
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-6 px-6 py-6">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-lg font-semibold text-blue-700">
              MC
            </div>
            <div>
              <div className="text-base font-semibold text-[#1A1A2E]">
                Marina Costa
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-600">
                <Mail className="h-3 w-3" />
                marina@email.com
              </div>
              <span className="mt-2 inline-flex rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                Ativo
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 rounded-xl border border-gray-100 bg-gray-50/50 p-4 text-center">
            <div>
              <div className="font-mono text-lg font-bold text-[#1A1A2E]">3</div>
              <div className="text-[10px] uppercase tracking-wider text-gray-500">
                Cursos
              </div>
            </div>
            <div>
              <div className="font-mono text-lg font-bold text-[#1A1A2E]">
                73%
              </div>
              <div className="text-[10px] uppercase tracking-wider text-gray-500">
                Progresso
              </div>
            </div>
            <div>
              <div className="font-mono text-lg font-bold text-[#1A1A2E]">
                R$ 1.161
              </div>
              <div className="text-[10px] uppercase tracking-wider text-gray-500">
                Valor total
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-[#1A1A2E]">Cursos</h3>
            <ul className="mt-3 space-y-3">
              {mockCourses.map((course) => (
                <li
                  key={course.nome}
                  className="rounded-xl border border-gray-100 bg-white p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-[#1A1A2E]">
                      {course.nome}
                    </div>
                    <span className="font-mono text-xs text-gray-500">
                      {course.progresso}%
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                    <div
                      className="h-full rounded-full bg-blue-600"
                      style={{ width: `${course.progresso}%` }}
                    />
                  </div>
                  <div className="mt-2 text-[10px] text-gray-500">
                    Matriculado em {course.data}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <footer className="grid grid-cols-2 gap-3 border-t border-gray-200 px-6 py-4">
          <Button variant="outline" className="w-full">
            <MessageSquare className="mr-2 h-4 w-4" />
            Mensagem
          </Button>
          <Button
            variant="outline"
            className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <Ban className="mr-2 h-4 w-4" />
            Bloquear
          </Button>
        </footer>
      </aside>
    </div>
  )
}
