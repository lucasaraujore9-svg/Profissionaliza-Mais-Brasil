import Link from "next/link"
import {
  AlertTriangle,
  CreditCard,
  CheckCircle2,
  Bell,
  Ban,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

export interface DashboardAlert {
  id: string
  level: "critical" | "warning" | "success"
  title: string
  description: string
  time: string
  tenantId?: string
}

interface AdminAlertsPanelProps {
  alerts: DashboardAlert[]
}

const LEVEL_STYLES: Record<DashboardAlert["level"], string> = {
  critical: "border-rose-200 bg-rose-50 text-rose-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
}

const LEVEL_ICONS: Record<DashboardAlert["level"], LucideIcon> = {
  critical: Ban,
  warning: AlertTriangle,
  success: CheckCircle2,
}

export function AdminAlertsPanel({ alerts }: AdminAlertsPanelProps) {
  const criticalCount = alerts.filter((a) => a.level === "critical").length

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">Alertas</h3>
        </div>
        {criticalCount > 0 && (
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
            {criticalCount} crítico{criticalCount > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {alerts.length === 0 ? (
        <div className="flex items-center gap-2 px-5 py-10 text-xs text-gray-500">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          Nenhum alerta ativo. Tudo em ordem.
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {alerts.map((alert) => {
            const Icon = alert.level === "critical" && alert.id.startsWith("overdue")
              ? CreditCard
              : LEVEL_ICONS[alert.level]
            const content = (
              <>
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${LEVEL_STYLES[alert.level]}`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-[var(--color-pmb-green-900)]">{alert.title}</p>
                  <p className="mt-0.5 text-xs text-gray-600">{alert.description}</p>
                  {alert.time && (
                    <p className="mt-1 text-[10px] font-medium text-gray-400">{alert.time}</p>
                  )}
                </div>
              </>
            )
            return (
              <li key={alert.id}>
                {alert.tenantId ? (
                  <Link
                    href={`/admin/revendedores/${alert.tenantId}`}
                    className="flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-gray-50"
                  >
                    {content}
                  </Link>
                ) : (
                  <div className="flex w-full items-start gap-3 px-5 py-4 text-left">
                    {content}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
