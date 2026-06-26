"use client"

import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// Expoe os status filtraveis pela coluna Student.status. "Pagamento pendente"
// e um status DERIVADO (nao persistido), entao e filtrado pelo seletor de
// curso/pagamento ao lado (enrollment = "pagamento_pendente"), nao aqui — assim
// nenhum chip vira no-op nem ha exibicao-sem-filtro.
export type StudentFilter =
  | "TODOS"
  | "ATIVO"
  | "DEVEDOR"
  | "BLOQUEADO"
  | "FORMADO"
  | "INTERESSADO"
  | "INATIVO"

export type EnrollmentFilter =
  | "TODOS"
  | "com_curso"
  | "sem_curso"
  | "pagamento_pendente"
  | "curso_finalizado"

const filters: { key: StudentFilter; label: string }[] = [
  { key: "TODOS", label: "Todos" },
  { key: "ATIVO", label: "Ativos" },
  { key: "DEVEDOR", label: "Devedores" },
  { key: "BLOQUEADO", label: "Bloqueados" },
  { key: "FORMADO", label: "Formados" },
  { key: "INTERESSADO", label: "Interessados" },
  { key: "INATIVO", label: "Inativos" },
]

const enrollmentFilters: { key: EnrollmentFilter; label: string }[] = [
  { key: "TODOS", label: "Curso/pagamento: todos" },
  { key: "com_curso", label: "Com curso" },
  { key: "sem_curso", label: "Sem curso" },
  { key: "pagamento_pendente", label: "Pagamento pendente" },
  { key: "curso_finalizado", label: "Curso finalizado" },
]

interface StudentToolbarProps {
  search: string
  onSearchChange: (value: string) => void
  filter: StudentFilter
  onFilterChange: (filter: StudentFilter) => void
  enrollmentFilter: EnrollmentFilter
  onEnrollmentFilterChange: (filter: EnrollmentFilter) => void
}

export function StudentToolbar({
  search,
  onSearchChange,
  filter,
  onFilterChange,
  enrollmentFilter,
  onEnrollmentFilterChange,
}: StudentToolbarProps) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div data-tour="alunos:busca" className="relative flex-1 lg:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          placeholder="Buscar por nome ou email..."
          className="pl-9"
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <div
        data-tour="alunos:filtros"
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
      >
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
          {filters.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onFilterChange(item.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                filter === item.key
                  ? "bg-white text-[var(--color-pmb-green-900)] shadow-sm"
                  : "text-gray-600 hover:text-[var(--color-pmb-green-900)]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <Select
          value={enrollmentFilter}
          onValueChange={(value) =>
            onEnrollmentFilterChange(value as EnrollmentFilter)
          }
        >
          <SelectTrigger className="h-auto w-full text-xs font-semibold text-gray-700 sm:w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {enrollmentFilters.map((item) => (
              <SelectItem key={item.key} value={item.key} className="text-xs">
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
