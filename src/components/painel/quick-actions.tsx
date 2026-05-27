import Link from "next/link"
import { ArrowUpRight, FileBarChart, Palette, Tag, Users } from "lucide-react"

const actions = [
  {
    label: "Criar cupom",
    description: "Atraia novos alunos com desconto",
    href: "/painel/cupons",
    icon: Tag,
  },
  {
    label: "Ver alunos",
    description: "Liste matrículas e contatos",
    href: "/painel/alunos",
    icon: Users,
  },
  {
    label: "Financeiro",
    description: "Receita, comissões e repasses",
    href: "/painel/financeiro",
    icon: FileBarChart,
  },
  {
    label: "Editar vitrine",
    description: "Logo, cores e seções da loja",
    href: "/painel/vitrine",
    icon: Palette,
  },
] as const

export function QuickActions() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
        Ações rápidas
      </h3>
      <p className="mt-1 text-xs text-gray-600">
        Acesse as operações mais comuns.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-2">
        {actions.map((action) => {
          const Icon = action.icon
          return (
            <Link
              key={action.label}
              href={action.href}
              className="group flex items-center gap-3 rounded-xl border border-[rgba(2,89,24,0.08)] bg-[var(--color-pmb-mist)]/40 p-3 transition-all hover:border-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-lime-50)]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-[var(--color-pmb-green)] shadow-sm ring-1 ring-[rgba(2,89,24,0.06)]">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                  {action.label}
                </p>
                <p className="truncate text-xs text-gray-600">
                  {action.description}
                </p>
              </div>
              <ArrowUpRight className="h-4 w-4 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--color-pmb-green)]" />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
