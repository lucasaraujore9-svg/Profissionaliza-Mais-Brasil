import { NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { listSyncLogs } from "@/lib/catalog/sync-log"

export async function GET() {
  const ctx = await requireAdminSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const logs = await listSyncLogs()
  return NextResponse.json({ data: { logs } })
}
