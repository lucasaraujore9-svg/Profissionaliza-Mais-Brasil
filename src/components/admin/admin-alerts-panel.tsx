import { AlertTriangle, CreditCard, Ban, CheckCircle2, Bell } from "lucide-react"

const ALERTS = [
  {
    id: "a1",
    icon: CreditCard,
    title: "Educa+ Cursos — pagamento vencido",
    description: "Fatura de R$ 297 em atraso há 3 dias. Assinatura será suspensa em 24h.",
    level: "critical" as const,
    time: "há 18min",
  },
  {
    id: "a2",
    icon: Ban,
    title: "Instituto Avance — suspenso automaticamente",
    description: "Inadimplência supera 15 dias. Revendedor notificado por e-mail.",
    level: "critical" as const,
    time: "há 2h",
  },
  {
    id: "a3",
    icon: AlertTriangle,
    title: "Sync com Escola Avançada ficou atrasado",
    description: "Última sincronização há 2h15. Verifique integração.",
    level: "warning" as const,
    time: "há 1h",
  },
  {
    id: "a4",
    icon: CheckCircle2,
    title: "18 novos revendedores aprovados esta semana",
    description: "Taxa de conversão do checkout subiu para 8,2%.",
    level: "success" as const,
    time: "há 5h",
  },
]

const LEVEL_STYLES = {
  critical: "border-rose-200 bg-rose-50 text-rose-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
}

export function AdminAlertsPanel() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-[#1A1A2E]">Alertas</h3>
        </div>
        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
          2 críticos
        </span>
      </div>

      <ul className="divide-y divide-gray-100">
        {ALERTS.map((alert) => {
          const Icon = alert.icon
          return (
            <li key={alert.id}>
              <button
                type="button"
                className="flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-gray-50"
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${LEVEL_STYLES[alert.level]}`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-[#1A1A2E]">{alert.title}</p>
                  <p className="mt-0.5 text-xs text-gray-600">{alert.description}</p>
                  <p className="mt-1 text-[10px] font-medium text-gray-400">{alert.time}</p>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
