import { NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { resolvePeriod } from "@/lib/reports/period"
import { canViewTab, reportTab } from "@/lib/reports/tabs"
import { getBiModule } from "@/lib/reports/bi"

export const dynamic = "force-dynamic"

/**
 * Dispatcher de BI do admin. Um endpoint parametrizado pela aba: valida sessão
 * + papel, resolve o período dos filtros e delega ao módulo da aba, devolvendo
 * um `ReportPayload` no envelope `{ data }`.
 *
 * `bi` é irmão ESTÁTICO do segmento dinâmico `[type]` (viewer de export), então
 * não há colisão de rotas.
 */
export const GET = withRequestContextParams<{ tab: string }>(
  { action: "admin.relatorios.bi.get", route: "/api/admin/relatorios/bi/[tab]" },
  async (request: Request, ctx) => {
    const session = await requireAdminSession()
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const { tab } = await ctx.params
    if (!reportTab(tab)) {
      return NextResponse.json({ error: "Aba inexistente" }, { status: 404 })
    }
    if (!canViewTab(session.role, tab)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
    }

    const biModule = getBiModule(tab)
    if (!biModule) {
      // Aba sem módulo (ex.: exportacoes) — não tem payload de BI.
      return NextResponse.json({ error: "Aba sem dados de BI" }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const period = resolvePeriod({
      preset: searchParams.get("period"),
      from: searchParams.get("from"),
      to: searchParams.get("to"),
    })

    const payload = await biModule.run({ session, period, sp: searchParams })
    return NextResponse.json({ data: payload })
  },
)
