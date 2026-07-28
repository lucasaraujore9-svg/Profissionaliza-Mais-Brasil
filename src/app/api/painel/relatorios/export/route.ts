import { NextResponse } from "next/server"
import { requirePainel } from "@/lib/auth/painel-guard"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { PAINEL_REPORT_DEFS } from "@/lib/reports/painel-definitions"

export const dynamic = "force-dynamic"

/** Lista os relatórios CSV que o papel do usuário pode gerar. */
export const GET = withRequestContext(
  { action: "painel.relatorios.export.list", route: "/api/painel/relatorios/export" },
  async () => {
    const guard = await requirePainel("relatorios.view")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    const defs = PAINEL_REPORT_DEFS.filter((d) => ctx.can(d.perm))
    return NextResponse.json({ data: { reports: defs } })
  },
)
