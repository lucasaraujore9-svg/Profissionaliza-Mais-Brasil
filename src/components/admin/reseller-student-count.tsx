import { GraduationCap, UserCheck, UserX } from "lucide-react"

export interface ResellerStudentsBreakdown {
  total: number
  active: number
  blocked: number
  inactive: number
}

interface ResellerStudentCountProps {
  students: ResellerStudentsBreakdown
}

export function ResellerStudentCount({ students }: ResellerStudentCountProps) {
  const counts = [
    { label: "Alunos totais", value: students.total, icon: GraduationCap, accent: "text-[var(--color-pmb-green)]" },
    { label: "Ativos", value: students.active, icon: UserCheck, accent: "text-emerald-600" },
    { label: "Bloqueados", value: students.blocked, icon: UserX, accent: "text-rose-600" },
  ]

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">Alunos vinculados</h3>
      <p className="mt-1 text-xs text-gray-600">
        Contagem agregada do vendedor na Escola Avançada.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {counts.map((c) => {
          const Icon = c.icon
          return (
            <div key={c.label} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                  {c.label}
                </p>
                <Icon className={`h-4 w-4 ${c.accent}`} />
              </div>
              <p className="mt-2 font-mono text-xl font-bold text-[var(--color-pmb-green-900)]">
                {c.value.toLocaleString("pt-BR")}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
