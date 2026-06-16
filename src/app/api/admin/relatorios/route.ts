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
  // Papéis modelados pelos runners. PMB_REVENDA_SALES/PMB_SALES_MGR não são
  // escopados → lista vazia (a geração também os bloqueia em /[type]).
  const REPORT_ROLES = ["SUPER_ADMIN", "PMB_SALES", "PMB_RESELLER_MGR"]
  if (!REPORT_ROLES.includes(session.role)) {
    return NextResponse.json({ data: { reports: [], role: session.role } })
  }

  const reports = REPORT_DEFS.filter(
    (r) =>
      // needsSuperAdmin → só super
      (!r.needsSuperAdmin || session.role === "SUPER_ADMIN") &&
      // PMB_SALES só enxerga os relatórios B2C permitidos
      (session.role !== "PMB_SALES" || r.pmbSalesAllowed),
  ).map((r) => ({
    id: r.id,
    group: r.group,
    label: r.label,
    description: r.description,
  }))

  return NextResponse.json({ data: { reports, role: session.role } })
  },
)
