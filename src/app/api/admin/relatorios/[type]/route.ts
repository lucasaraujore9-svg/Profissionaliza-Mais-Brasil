import { NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { csvResponse } from "@/lib/reports/csv"
import {
  REPORT_DEFS,
  getReportRunner,
} from "@/lib/reports/definitions"

export const dynamic = "force-dynamic"

interface Ctx {
  params: Promise<{ type: string }>
}

export async function GET(request: Request, ctx: Ctx) {
  const session = await requireAdminSession()
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const { type } = await ctx.params
  const def = REPORT_DEFS.find((d) => d.id === type)
  if (!def) {
    return NextResponse.json({ error: "Relatório não encontrado" }, { status: 404 })
  }
  if (def.needsSuperAdmin && session.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Apenas SUPER_ADMIN pode gerar este relatório" },
      { status: 403 },
    )
  }

  const runner = getReportRunner(type)
  if (!runner) {
    return NextResponse.json(
      { error: "Relatório sem implementação" },
      { status: 500 },
    )
  }

  const url = new URL(request.url)
  const filters = {
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    tenantId: url.searchParams.get("tenantId") ?? undefined,
  }

  try {
    const { csv, filename } = await runner.generate(filters)
    const dateStamp = new Date().toISOString().slice(0, 10)
    return csvResponse(csv, `${filename}-${dateStamp}.csv`)
  } catch (error) {
    console.error("[reports] failed:", error)
    const message = error instanceof Error ? error.message : "Erro desconhecido"
    return NextResponse.json(
      { error: `Falha ao gerar relatório: ${message}` },
      { status: 500 },
    )
  }
}
