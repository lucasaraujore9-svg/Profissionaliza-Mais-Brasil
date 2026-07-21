import { NextResponse } from "next/server"
import { sweepFreeEnrollments } from "@/lib/checkout/sweep-free-enrollments"
import { isCronAuthorized } from "@/lib/auth/bearer"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"

export const maxDuration = 300

/**
 * Remediação (sob demanda, sem agendamento) das matrículas travadas pelo bug do
 * cupom de 100%: PENDING com finalAmount <= 0, que nunca puderam ser cobradas.
 *
 * Padrão do repo: rodar manutenção pelo runtime de produção, porque os segredos
 * do banco não são acessíveis fora da Vercel.
 *
 *   Simulação (não altera nada, é o padrão):
 *     POST /api/cron/sweep-free-enrollments
 *   Aplicar de fato:
 *     POST /api/cron/sweep-free-enrollments?apply=1
 */
export const POST = withRequestContext(
  { action: "cron.sweep_free_enrollments", route: "/api/cron/sweep-free-enrollments" },
  async (request: Request) => {
    if (!isCronAuthorized(request)) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const url = new URL(request.url)
    const apply = url.searchParams.get("apply") === "1"
    const limitParam = Number(url.searchParams.get("limit"))
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined

    try {
      const result = await sweepFreeEnrollments({ dryRun: !apply, limit })
      contextLogger().info(
        {
          event: "cron.sweep_free_enrollments.done",
          dryRun: result.dryRun,
          found: result.found,
          released: result.released,
          failed: result.failed,
        },
        "sweep-free-enrollments concluído",
      )
      return NextResponse.json({ data: result })
    } catch (error) {
      contextLogger().error(
        { err: error, event: "cron.sweep_free_enrollments.failed" },
        "sweep-free-enrollments falhou",
      )
      const message = error instanceof Error ? error.message : "Erro desconhecido"
      return NextResponse.json(
        { error: `Falha na varredura: ${message}` },
        { status: 502 },
      )
    }
  },
)

export async function GET(request: Request) {
  return POST(request)
}
