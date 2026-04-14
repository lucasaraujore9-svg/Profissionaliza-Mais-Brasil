import { Cpu, GitBranch, Clock, Database } from "lucide-react"

const INFO = [
  { label: "Versão", value: "v1.4.2", icon: GitBranch },
  { label: "Ambiente", value: "produção", icon: Cpu },
  { label: "Última sync EA", value: "08/04/2026 14:22", icon: Clock },
  { label: "Banco", value: "Supabase (us-east-1)", icon: Database },
]

export function SystemInfo() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-[#1A1A2E]">Informações do sistema</h3>
      <p className="mt-1 text-xs text-gray-600">
        Diagnóstico rápido para suporte e debugging.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {INFO.map((info) => {
          const Icon = info.icon
          return (
            <div key={info.label} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-gray-500 shadow-sm">
                <Icon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                  {info.label}
                </p>
                <p className="mt-0.5 font-mono text-xs font-semibold text-[#1A1A2E]">
                  {info.value}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
