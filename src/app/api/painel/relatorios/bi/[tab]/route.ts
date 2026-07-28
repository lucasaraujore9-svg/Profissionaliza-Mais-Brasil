import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { resolvePeriod } from "@/lib/reports/period"
import { canViewPainelTab, painelTab } from "@/lib/reports/painel/tabs"
import { getPainelBiModule } from "@/lib/reports/painel"

export const dynamic = "force-dynamic"

/**
 * Dispatcher de BI do painel (revenda). ISOLAMENTO MULTI-TENANT (P0): a sessão
 * fixa `ctx.tenantId` e todos os módulos filtram por ele. A permissão de cada
 * aba é reforçada aqui no servidor — nunca confiar no cliente ter escondido a aba.
 */
export const GET = withRequestContextParams<{ tab: string }>(
  { action: "painel.relatorios.bi.get", route: "/api/painel/relatorios/bi/[tab]" },
  async (request: Request, routeCtx) => {
    const guard = await requirePainel("relatorios.view")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    const { tab } = await routeCtx.params
    if (!painelTab(tab)) {
      return NextResponse.json({ error: "Aba inexistente" }, { status: 404 })
    }

    if (!canViewPainelTab(tab, ctx.can)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { canSellResellers: true },
    })
    const isOwner = ctx.isOwner
    const canSellResellers = !!tenant?.canSellResellers

    const biModule = getPainelBiModule(tab)
    if (!biModule) {
      return NextResponse.json({ error: "Aba sem dados de BI" }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const period = resolvePeriod({
      preset: searchParams.get("period"),
      from: searchParams.get("from"),
      to: searchParams.get("to"),
    })

    const payload = await biModule.run({
      tenantId: ctx.tenantId,
      isOwner,
      canSellResellers,
      period,
      sp: searchParams,
    })
    return NextResponse.json({ data: payload })
  },
)
