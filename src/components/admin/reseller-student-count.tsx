import { GraduationCap, UserCheck, UserX } from "lucide-react"

const COUNTS = [
  { label: "Alunos totais", value: "1.284", icon: GraduationCap, accent: "text-blue-600" },
  { label: "Ativos", value: "1.086", icon: UserCheck, accent: "text-emerald-600" },
  { label: "Bloqueados", value: "142", icon: UserX, accent: "text-rose-600" },
]

export function ResellerStudentCount() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-[#1A1A2E]">Alunos vinculados</h3>
      <p className="mt-1 text-xs text-gray-600">
        Contagem agregada do vendedor na Escola Avançada.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {COUNTS.map((c) => {
          const Icon = c.icon
          return (
            <div key={c.label} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                  {c.label}
                </p>
                <Icon className={`h-4 w-4 ${c.accent}`} />
              </div>
              <p className="mt-2 font-mono text-xl font-bold text-[#1A1A2E]">{c.value}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
