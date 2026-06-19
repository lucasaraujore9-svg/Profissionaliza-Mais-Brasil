import { NextResponse } from "next/server"
import { syncLmsDayUpdate } from "@/lib/lms/day-update"
import { isCronAuthorized } from "@/lib/auth/bearer"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"

export const maxDuration = 300
export const dynamic = "force-dynamic"

export const POST = withRequestContext(
  { action: "cron.sync_day_update_lms", route: "/api/cron/sync-day-update-lms" },
  async (request: Request) => {
    if (!isCronAuthorized(request)) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }
    try {
      const result = await syncLmsDayUpdate()
      return NextResponse.json({ data: result })
    } catch (err) {
      contextLogger().error(
        { err, event: "cron.sync_day_update_lms.failed" },
        "cron sync-day-update-lms falhou",
      )
      const message = err instanceof Error ? err.message : "Erro desconhecido"
      return NextResponse.json(
        { error: `Falha no delta LMS: ${message}` },
        { status: 502 },
      )
    }
  },
)

export async function GET(request: Request) {
  return POST(request)
}
