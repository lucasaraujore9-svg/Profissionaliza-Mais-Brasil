import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { buildCsv, csvResponse } from "@/lib/reports/csv"
import {
  getPainelReportRunner,
  painelReportDef,
} from "@/lib/reports/painel-definitions"

export const dynamic = "force-dynamic"

/**
 * Gera um relatório CSV (ou preview JSON) da unidade. SEMPRE tenant-scoped:
 * `filters.tenantId = ctx.tenantId` (o runner lança se faltar). Defs owner-only
 * exigem owner direto.
 */
export const GET = withRequestContextParams<{ report: string }>(
  { action: "painel.relatorios.export.get", route: "/api/painel/relatorios/export/[report]" },
  async (request: Request, routeCtx) => {
    const ctx = await requireResellerSession()
    if (!ctx) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

    const { report } = await routeCtx.params
    const def = painelReportDef(report)
    const runner = getPainelReportRunner(report)
    if (!def || !runner) {
      return NextResponse.json({ error: "Relatório inexistente" }, { status: 404 })
    }

    if (def.ownerOnly) {
      const owner = await prisma.user.findFirst({
        where: { id: ctx.userId, tenantId: ctx.tenantId },
        select: { id: true },
      })
      if (!owner) return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const from = searchParams.get("from") ?? undefined
    const to = searchParams.get("to") ?? undefined
    const format = searchParams.get("format") ?? "csv"

    const data = await runner.generate({ tenantId: ctx.tenantId, from, to })

    if (format === "json") {
      return NextResponse.json({ data })
    }

    const csv = buildCsv(data.header, data.rows)
    const stamp = new Date().toISOString().slice(0, 10)
    return csvResponse(csv, `${data.filename}-${stamp}.csv`)
  },
)
