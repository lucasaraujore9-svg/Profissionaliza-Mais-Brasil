import { NextResponse } from "next/server"
import { getCronHealth } from "@/lib/observability/cron-heartbeat"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

/**
 * Saúde dos jobs agendados: quando cada um rodou pela última vez e quais estão
 * ATRASADOS. Só SUPER_ADMIN — expõe a topologia interna de automação.
 *
 * É a resposta à pergunta que ficou seis semanas sem resposta em 2026 (quebra do
 * pg_net): "os crons ainda estão rodando?".
 */
export const GET = withRequestContext(
  { action: "admin.crons.health", route: "/api/admin/crons" },
  async () => {
    const guard = await requireAdmin("configuracoes.manage")
    if (!guard.ok) return guard.response
    const jobs = await getCronHealth()
    return NextResponse.json({
      data: {
        jobs,
        overdueCount: jobs.filter((j) => j.overdue).length,
        // Nenhuma linha = nenhum job rodou desde o deploy do batimento. Não é o
        // mesmo que "tudo bem": é "ainda não sei".
        neverRan: jobs.length === 0,
      },
    })
  },
)
