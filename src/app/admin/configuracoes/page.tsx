import Link from "next/link"
import { Share2, ChevronRight, Building2, Zap, LineChart } from "lucide-react"
import { PageHeader } from "@/components/painel/page-header"
import { AdminConfigClient } from "@/components/admin/admin-config-client"
import { requireAdminSession } from "@/lib/auth/admin-session"

// Configurações de Certificados agora vivem dentro de /admin/certificados/configuracoes.
const SUB_SETTINGS = [
  {
    href: "/admin/configuracoes/automacao",
    label: "Automação",
    description: "Liga/desliga WhatsApp + CRM Kanban do site PMB institucional",
    icon: Zap,
  },
  {
    href: "/admin/configuracoes/indicacoes",
    label: "Indicações",
    description: "Comissão padrão, dia de pagamento, mínimo de saque",
    icon: Share2,
  },
  {
    href: "/admin/configuracoes/unidade-tecnica",
    label: "Unidade Técnica",
    description: "Link da escola técnica do site PMB institucional",
    icon: Building2,
  },
  {
    href: "/admin/configuracoes/rastreamento",
    label: "Rastreamento",
    description: "Pixels (GA4, Ads, Meta, TikTok…) do site PMB e das vitrines",
    icon: LineChart,
  },
]

export default async function AdminConfigPage() {
  const ctx = await requireAdminSession()
  const canEditGateway = ctx?.role === "SUPER_ADMIN"

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        description="Parâmetros globais, integrações, webhooks e informações do sistema."
      />

      {canEditGateway && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Módulos
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {SUB_SETTINGS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-mist)]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-pmb-green)]/10 text-[var(--color-pmb-green)]">
                  <item.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                  <p className="text-xs text-gray-500">{item.description}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <AdminConfigClient canEditGateway={canEditGateway} />
    </div>
  )
}
