import { NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { listSyncLogs } from "@/lib/catalog/sync-log"
import { withRequestContext } from "@/lib/observability/with-request-context"

export const GET = withRequestContext(
  { action: "admin.catalogo.sync_log.list", route: "/api/admin/catalogo/sync-log" },
  async () => {
  const ctx = await requireAdminSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const logs = await listSyncLogs()
  return NextResponse.json({ data: { logs } })
  },
)
