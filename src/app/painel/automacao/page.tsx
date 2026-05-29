import Link from "next/link"
import { redirect } from "next/navigation"
import {
  MessageCircle,
  ListChecks,
  Inbox,
  CheckCircle2,
  XCircle,
} from "lucide-react"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PageHeader } from "@/components/painel/page-header"
import { AutomationGate } from "@/components/painel/automation-gate"

const WA_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  WORKING: { label: "Conectado", color: "text-emerald-700" },
  CONNECTING: { label: "Conectando…", color: "text-amber-700" },
  SCAN_QR_CODE: { label: "Aguardando QR", color: "text-amber-700" },
  DISCONNECTED: { label: "Desconectado", color: "text-gray-600" },
  FAILED: { label: "Falha", color: "text-red-700" },
}

export default async function PainelAutomacaoPage() {
  const session = await auth()
  if (
    !session?.user ||
    session.user.role !== "RESELLER" ||
    !session.user.tenantId
  ) {
    redirect("/login?callbackUrl=/painel/automacao")
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: {
      automationEnabled: true,
      waStatus: true,
      waConnectedPhone: true,
    },
  })

  const waStatus = tenant?.waStatus ?? "DISCONNECTED"
  const statusMeta = WA_STATUS_LABEL[waStatus] ?? WA_STATUS_LABEL.DISCONNECTED
  const isConnected = waStatus === "WORKING"

  return (
    <div className="space-y-6">
      <PageHeader
        title="Automação"
        description="Configure o WhatsApp da unidade, as mensagens automáticas e acompanhe os leads."
      />

      <AutomationGate enabled={!!tenant?.automationEnabled}>
        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <div
                className={`rounded-lg p-2 ${
                  isConnected ? "bg-emerald-50" : "bg-gray-100"
                }`}
              >
                {isConnected ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-gray-400" />
                )}
              </div>
              <div className="flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Status WhatsApp
                </p>
                <p className={`text-base font-bold ${statusMeta.color}`}>
                  {statusMeta.label}
                </p>
                {tenant?.waConnectedPhone && (
                  <p className="font-mono text-sm text-gray-700">
                    {tenant.waConnectedPhone}
                  </p>
                )}
              </div>
              <Link
                href="/painel/automacao/conexao"
                className="rounded-md border border-[var(--color-pmb-green)] px-3 py-1.5 text-xs font-semibold text-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-mist)]"
              >
                {isConnected ? "Gerenciar" : "Conectar"}
              </Link>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <NavCard
              href="/painel/automacao/conexao"
              icon={<MessageCircle className="h-5 w-5" />}
              title="Conexão WhatsApp"
              description="Conecte o número da unidade escaneando um QR Code."
            />
            <NavCard
              href="/painel/automacao/mensagens"
              icon={<ListChecks className="h-5 w-5" />}
              title="Mensagens automáticas"
              description="Edite os templates enviados em cada etapa do funil."
            />
            <NavCard
              href="/painel/leads"
              icon={<Inbox className="h-5 w-5" />}
              title="Kanban de Leads"
              description="Visualize e trabalhe seus leads em pipeline."
            />
          </div>
        </div>
      </AutomationGate>
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
      <h3 className="mt-3 text-sm font-bold text-[var(--color-pmb-green-900)]">
        {title}
      </h3>
      <p className="mt-1 text-xs text-gray-600">{description}</p>
    </Link>
  )
}
