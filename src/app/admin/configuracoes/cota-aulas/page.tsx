import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { requireAdminPage } from "@/lib/auth/admin-guard"
import { PageHeader } from "@/components/painel/page-header"
import { AdminPaceGateSettingsForm } from "@/components/admin/admin-pace-gate-settings-form"
import { WriteGate } from "@/components/shared/permissions/permission-context"
import {
  PACE_GATED_WHERE,
  PACE_PRIMARY_SELECT,
  isPaceBlocked,
} from "@/lib/enrollment/pace-gate"

export const dynamic = "force-dynamic"

/**
 * Teto da amostra do impacto. A conta de "passaram da cota" é a mesma do motor
 * (`isPaceBlocked`) e não tem gêmeo em SQL, então precisa das linhas em memória.
 * Hoje a rede tem dezenas de matrículas parceladas; o teto existe para a página
 * não degradar se isso crescer uma ordem de grandeza.
 */
const IMPACT_SAMPLE = 2000

export default async function AdminPaceGateSettingsPage() {
  await requireAdminPage("configuracoes.view")

  const [settings, gatedRows] = await Promise.all([
    prisma.systemSettings.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default" },
      select: { paceGateEnabled: true, paceGateStrict: true },
    }),
    prisma.enrollment.findMany({
      where: { status: "ACTIVE", ...PACE_GATED_WHERE },
      select: {
        paymentType: true,
        installmentsPaid: true,
        installmentsTotal: true,
        progressPercent: true,
        paceExemptAt: true,
        paceBlockedAt: true,
        ...PACE_PRIMARY_SELECT,
      },
      take: IMPACT_SAMPLE,
    }),
  ])

  const impact = {
    gated: gatedRows.length,
    overQuota: gatedRows.filter((e) => !e.paceExemptAt && isPaceBlocked(e))
      .length,
    blocked: gatedRows.filter((e) => e.paceBlockedAt !== null).length,
  }

  return (
    <WriteGate
      perm="configuracoes.manage"
      notice="Você está vendo esta configuração em modo somente leitura. Para editá-la, peça a permissão “Editar as configurações do sistema”."
    >
      <div className="space-y-6">
        <Link
          href="/admin/configuracoes"
          className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 hover:text-[var(--color-pmb-green-900)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar para configurações
        </Link>

        <PageHeader
          title="Cota de aulas"
          description="Trava o avanço do aluno na fração do curso que ele já pagou. Vale para venda parcelada no boleto (carnê) e mensalidade."
        />

        <AdminPaceGateSettingsForm
          initial={{
            enabled: settings.paceGateEnabled,
            strict: settings.paceGateStrict,
          }}
          impact={impact}
        />
      </div>
    </WriteGate>
  )
}
