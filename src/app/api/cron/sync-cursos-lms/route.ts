import { NextResponse } from "next/server"
import { syncCatalogFromLMS } from "@/lib/catalog/sync-lms"
import { authorizeCron } from "@/lib/observability/cron-heartbeat"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"

export const maxDuration = 300

export const POST = withRequestContext(
  { action: "cron.sync_cursos_lms", route: "/api/cron/sync-cursos-lms" },
  async (request: Request) => {
    if (!(await authorizeCron(request))) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    try {
      const result = await syncCatalogFromLMS("cron")
      contextLogger().info(
        { event: "cron.sync_cursos_lms.done", ...result },
        "cron sync-cursos-lms concluído",
      )
      return NextResponse.json({ data: result })
    } catch (error) {
      contextLogger().error(
        { err: error, event: "cron.sync_cursos_lms.failed" },
        "cron sync-cursos-lms: sincronização do catálogo LMS falhou",
      )
      const message = error instanceof Error ? error.message : "Erro desconhecido"
      return NextResponse.json(
        { error: `Falha ao sincronizar catálogo LMS: ${message}` },
        { status: 502 },
      )
    }
  },
)

export async function GET(request: Request) {
  return POST(request)
}
