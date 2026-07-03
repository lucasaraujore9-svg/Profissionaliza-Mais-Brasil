import { NextResponse } from "next/server"
import { syncCatalogFromEA } from "@/lib/catalog/sync"
import { isCronAuthorized } from "@/lib/auth/bearer"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"

export const maxDuration = 300

export const POST = withRequestContext(
  { action: "cron.sync_cursos", route: "/api/cron/sync-cursos" },
  async (request: Request) => {
    if (!isCronAuthorized(request)) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    try {
      const result = await syncCatalogFromEA("cron")
      contextLogger().info(
        { event: "cron.sync_cursos.done", ...result },
        "cron sync-cursos concluído",
      )
      return NextResponse.json({ data: result })
    } catch (error) {
      contextLogger().error(
        { err: error, event: "cron.sync_cursos.failed" },
        "cron sync-cursos: sincronização do catálogo EA falhou",
      )
      const message = error instanceof Error ? error.message : "Erro desconhecido"
      return NextResponse.json(
        { error: `Falha ao sincronizar catálogo: ${message}` },
        { status: 502 },
      )
    }
  },
)

export async function GET(request: Request) {
  return POST(request)
}
