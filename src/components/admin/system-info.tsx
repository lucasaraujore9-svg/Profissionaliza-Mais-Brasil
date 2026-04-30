import { Cpu, GitBranch, Clock, Database } from "lucide-react"

export interface SystemInfoData {
  appVersion: string
  environment: string
  lastSyncAt: string | null
}

interface SystemInfoProps {
  info: SystemInfoData
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString("pt-BR")
  } catch {
    return iso
  }
}

export function SystemInfo({ info }: SystemInfoProps) {
  const items = [
    { label: "Versão", value: `v${info.appVersion}`, icon: GitBranch },
    { label: "Ambiente", value: info.environment, icon: Cpu },
    { label: "Última sincronização", value: formatDate(info.lastSyncAt), icon: Clock },
    { label: "Banco", value: "Supabase PostgreSQL", icon: Database },
  ]

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">Informações do sistema</h3>
      <p className="mt-1 text-xs text-gray-600">
        Diagnóstico rápido para suporte e debugging.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <div
              key={item.label}
              className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-gray-500 shadow-sm">
                <Icon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                  {item.label}
                </p>
                <p className="mt-0.5 font-mono text-xs font-semibold text-[var(--color-pmb-green-900)]">
                  {item.value}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
