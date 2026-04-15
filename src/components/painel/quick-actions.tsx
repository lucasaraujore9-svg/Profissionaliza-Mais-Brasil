import Link from "next/link"
import { Tag, Users, FileBarChart, Palette } from "lucide-react"

const actions = [
  {
    label: "Novo cupom",
    href: "/painel/cupons",
    icon: Tag,
    color: "bg-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-green-700)]",
  },
  {
    label: "Ver alunos",
    href: "/painel/alunos",
    icon: Users,
    color: "bg-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-green-700)]",
  },
  {
    label: "Relatório",
    href: "/painel/financeiro",
    icon: FileBarChart,
    color: "bg-emerald-600 hover:bg-emerald-700",
  },
  {
    label: "Editar vitrine",
    href: "/painel/vitrine",
    icon: Palette,
    color: "bg-purple-600 hover:bg-purple-700",
  },
] as const

export function QuickActions() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">Ações rápidas</h3>
      <p className="mt-1 text-xs text-gray-600">
        Acesse as operações mais comuns.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {actions.map((action) => {
          const Icon = action.icon
          return (
            <Link
              key={action.label}
              href={action.href}
              className={`flex flex-col items-start gap-2 rounded-xl p-4 text-white transition-all ${action.color}`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-sm font-semibold">{action.label}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
