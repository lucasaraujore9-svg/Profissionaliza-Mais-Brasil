import Link from "next/link"
import {
  Share2,
  ChevronRight,
  Building2,
  Zap,
  LineChart,
  GaugeCircle,
} from "lucide-react"
import { PageHeader } from "@/components/painel/page-header"
import { AdminConfigClient } from "@/components/admin/admin-config-client"
import { requireAdminPage } from "@/lib/auth/admin-guard"
import { WriteGate } from "@/components/shared/permissions/permission-context"
import type { AdminPermission } from "@/lib/auth/admin-permissions"
import { env } from "@/lib/env"

// Configurações de Certificados agora vivem dentro de /admin/certificados/configuracoes.
//
// Cada módulo declara a permissão de LEITURA da sua própria página — é o mesmo
// gate que o `requireAdminPage` de cada destino aplica. Antes a lista inteira
// era escondida por `integracoes.manage`, que não tem relação nenhuma com estas
// telas: quem podia abri-las não via o caminho até elas.
const SUB_SETTINGS: {
  href: string
  label: string
  description: string
  icon: typeof Zap
  perm: AdminPermission
}[] = [
  {
    href: "/admin/configuracoes/automacao",
    label: "Automação",
    description: "Liga/desliga WhatsApp + CRM Kanban do site PMB institucional",
    icon: Zap,
    perm: "configuracoes.view",
  },
  {
    href: "/admin/configuracoes/cota-aulas",
    label: "Cota de aulas",
    description: "Trava o aluno na fatia do curso que ele já pagou (carnê/mensalidade)",
    icon: GaugeCircle,
    perm: "configuracoes.view",
  },
  {
    href: "/admin/configuracoes/indicacoes",
    label: "Indicações",
    description: "Comissão padrão, dia de pagamento, mínimo de saque",
    icon: Share2,
    perm: "indicacoes.view",
  },
  {
    href: "/admin/configuracoes/unidade-tecnica",
    label: "Unidade Técnica",
    description: "Link da escola técnica do site PMB institucional",
    icon: Building2,
    perm: "vitrine.view",
  },
  {
    href: "/admin/configuracoes/rastreamento",
    label: "Rastreamento",
    description: "Pixels (GA4, Ads, Meta, TikTok…) do site PMB e das vitrines",
    icon: LineChart,
    perm: "configuracoes.view",
  },
]

export default async function AdminConfigPage() {
  const ctx = await requireAdminPage("configuracoes.view")
  const canEditGateway = ctx.can("integracoes.manage")
  const modules = SUB_SETTINGS.filter((item) => ctx.can(item.perm))

  // Segredo do webhook do LMS exibido na aba API — só para SUPER_ADMIN (precisa
  // dele para configurar o lado do LMS). Lido server-side; null se não for
  // SUPER_ADMIN ou se a env ainda não foi setada no deploy atual.
  const pmbWebhookSecret = canEditGateway
    ? env.PMB_WEBHOOK_SECRET ?? null
    : null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        description="Parâmetros globais, integrações, webhooks e informações do sistema."
      />

      {modules.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Módulos
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {modules.map((item) => (
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

      {/* A tela reúne duas escritas: parâmetros globais (`configuracoes.manage`)
          e credenciais de integração (`integracoes.manage`). Quem não tem
          NENHUMA das duas vê tudo desabilitado; quem tem só uma continua
          editando a sua parte — `canEditGateway` faz o recorte fino dentro. */}
      <WriteGate
        perm={["configuracoes.manage", "integracoes.manage"]}
        notice="Você está vendo as configurações em modo somente leitura. Para alterá-las, peça a permissão “Editar as configurações do sistema”."
      >
        <AdminConfigClient
          canEditGateway={canEditGateway}
          pmbWebhookSecret={pmbWebhookSecret}
        />
      </WriteGate>
    </div>
  )
}
