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
  // Log do sync acompanha o sync (SUPER_ADMIN-only).
  if (ctx.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  const logs = await listSyncLogs()
  return NextResponse.json({ data: { logs } })
  },
)
