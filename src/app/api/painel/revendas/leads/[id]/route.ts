import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireResellerSeller } from "@/lib/auth/guards"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

// PATCH /api/painel/revendas/leads/[id] — o revendedor-vendedor atualiza o status
// de um lead de revenda atribuído ao código DELE (referrerTenantId == unidade).
// Escopado: nunca toca leads de outra unidade.
const bodySchema = z.object({
  status: z.enum(["NEW", "CONTACTED", "CONVERTED", "LOST"]),
})

export const PATCH = withRequestContextParams<{ id: string }>(
  { action: "painel.revendas.leads.update", route: "/api/painel/revendas/leads/[id]" },
  async (request: Request, { params }) => {
    const guard = await requireResellerSeller()
    if (!guard.ok) return guard.response
    const sellerTenantId = guard.tenantId

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }
    const parsed = bodySchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
    }

    const { id } = await params
    // updateMany + escopo por referrerTenantId: 0 linhas se o lead não é deste
    // vendedor — sem vazamento e sem 500.
    const res = await prisma.lead.updateMany({
      where: { id, referrerTenantId: sellerTenantId },
      data: { status: parsed.data.status },
    })
    if (res.count === 0) {
      return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 })
    }

    return NextResponse.json({ data: { id, status: parsed.data.status } })
  },
)
