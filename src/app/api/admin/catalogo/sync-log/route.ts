import { NextResponse } from "next/server"
import { listSyncLogs } from "@/lib/catalog/sync-log"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

export const GET = withRequestContext(
  { action: "admin.catalogo.sync_log.list", route: "/api/admin/catalogo/sync-log" },
  async () => {
  const guard = await requireAdmin("catalogo.sync")
  if (!guard.ok) return guard.response
  // Log do sync acompanha o sync (SUPER_ADMIN-only).
  const logs = await listSyncLogs()
  return NextResponse.json({ data: { logs } })
  },
)
