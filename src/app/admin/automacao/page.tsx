import Link from "next/link"
import { redirect } from "next/navigation"
import {
  MessageCircle,
  ListChecks,
  Inbox,
  CheckCircle2,
  XCircle,
} from "lucide-react"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { prisma } from "@/lib/prisma"
import { PageHeader } from "@/components/painel/page-header"

const WA_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  WORKING: { label: "Conectado", color: "text-emerald-700" },
  CONNECTING: { label: "Conectando…", color: "text-amber-700" },
  SCAN_QR_CODE: { label: "Aguardando QR", color: "text-amber-700" },
  DISCONNECTED: { label: "Desconectado", color: "text-gray-600" },
  FAILED: { label: "Falha", color: "text-red-700" },
}

export default async function AdminAutomacaoPage() {
  const session = await requireAdminSession()
  if (!session) redirect("/login?callbackUrl=/admin/automacao")
  if (session.role !== "SUPER_ADMIN") redirect("/admin")

  const settings = await prisma.systemSettings.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
    select: {
      pmbAutomationEnabled: true,
      pmbWaStatus: true,
      pmbWaConnectedPhone: true,
    },
  })

  const statusMeta =
    WA_STATUS_LABEL[settings.pmbWaStatus] ?? WA_STATUS_LABEL.DISCONNECTED
  const isConnected = settings.pmbWaStatus === "WORKING"

  return (
    <div className="space-y-6">
      <PageHeader
        title="Automação"
        description="Conexão WhatsApp, templates de mensagens e Kanban de leads da vitrine PMB."
      />

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className={`rounded-lg p-2 ${isConnected ? "bg-emerald-50" : "bg-gray-100"}`}>
            {isConnected ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <XCircle className="h-5 w-5 text-gray-400" />
            )}
          </div>
          <div className="flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Status WhatsApp PMB
            </p>
            <p className={`text-base font-bold ${statusMeta.color}`}>{statusMeta.label}</p>
            {settings.pmbWaConnectedPhone && (
              <p className="font-mono text-sm text-gray-700">
                {settings.pmbWaConnectedPhone}
              </p>
            )}
          </div>
          <Link
            href="/admin/automacao/conexao"
            className="rounded-md border border-[var(--color-pmb-green)] px-3 py-1.5 text-xs font-semibold text-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-mist)]"
          >
            {isConnected ? "Gerenciar" : "Conectar"}
          </Link>
        </div>
        {!settings.pmbAutomationEnabled && (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            Módulo desativado. Ative em Configurações para liberar o formulário
            na vitrine institucional e os disparos automáticos.
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <NavCard
          href="/admin/automacao/conexao"
          icon={<MessageCircle className="h-5 w-5" />}
          title="Conexão WhatsApp"
          description="Conecte o número PMB escaneando um QR Code."
        />
        <NavCard
          href="/admin/automacao/mensagens"
          icon={<ListChecks className="h-5 w-5" />}
          title="Mensagens automáticas"
          description="Edite os templates enviados em cada etapa do funil."
        />
        <NavCard
          href="/admin/leads"
          icon={<Inbox className="h-5 w-5" />}
          title="Kanban de Leads"
          description="Visualize e trabalhe os leads da vitrine institucional."
        />
      </div>
    </div>
  )
}

interface NavCardProps {
  href: string
  icon: React.ReactNode
  title: string
  description: string
}

function NavCard({ href, icon, title, description }: NavCardProps) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-gray-200 bg-white p-5 transition hover:border-[var(--color-pmb-green)] hover:shadow-md"
    >
      <div className="inline-flex rounded-lg bg-[var(--color-pmb-mist)] p-2 text-[var(--color-pmb-green)] group-hover:bg-[var(--color-pmb-lime-50)]">
        {icon}
      </div>
      <h3 className="mt-3 text-sm font-bold text-[var(--color-pmb-green-900)]">{title}</h3>
      <p className="mt-1 text-xs text-gray-600">{description}</p>
    </Link>
  )
}
