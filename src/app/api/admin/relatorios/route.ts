import { NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { REPORT_DEFS } from "@/lib/reports/definitions"
import { withRequestContext } from "@/lib/observability/with-request-context"

export const GET = withRequestContext(
  { action: "admin.relatorios.list", route: "/api/admin/relatorios" },
  async () => {
  const session = await requireAdminSession()
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const reports = REPORT_DEFS.filter(
    (r) => !r.needsSuperAdmin || session.role === "SUPER_ADMIN",
  ).map((r) => ({
    id: r.id,
    group: r.group,
    label: r.label,
    description: r.description,
  }))

  return NextResponse.json({ data: { reports, role: session.role } })
  },
)
