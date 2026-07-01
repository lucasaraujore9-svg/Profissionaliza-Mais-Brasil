import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { PAINEL_REPORT_DEFS } from "@/lib/reports/painel-definitions"

export const dynamic = "force-dynamic"

/** Lista os relatórios CSV disponíveis para a unidade (owner-only filtrados). */
export const GET = withRequestContext(
  { action: "painel.relatorios.export.list", route: "/api/painel/relatorios/export" },
  async () => {
    const ctx = await requireResellerSession()
    if (!ctx) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

    const owner = await prisma.user.findFirst({
      where: { id: ctx.userId, tenantId: ctx.tenantId },
      select: { id: true },
    })
    const isOwner = !!owner

    const defs = PAINEL_REPORT_DEFS.filter((d) => !d.ownerOnly || isOwner)
    return NextResponse.json({ data: { reports: defs } })
  },
)
