import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { listLeadAssignees } from "@/lib/automation/assign"

export const GET = withRequestContext(
  {
    action: "painel.leads.distribuicao.get",
    route: "/api/painel/leads/distribuicao",
  },
  async () => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const [tenant, members] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: ctx.tenantId },
        select: { leadAutoAssign: true },
      }),
      listLeadAssignees(ctx.tenantId),
    ])

    if (!tenant) {
      return NextResponse.json({ error: "Tenant não encontrado" }, { status: 404 })
    }

    return NextResponse.json({
      data: { autoAssign: tenant.leadAutoAssign, members },
    })
  },
)

const putSchema = z.object({
  autoAssign: z.boolean(),
})

export const PUT = withRequestContext(
  {
    action: "painel.leads.distribuicao.update",
    route: "/api/painel/leads/distribuicao",
  },
  async (request: Request) => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const parsed = putSchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const updated = await prisma.tenant.update({
      where: { id: ctx.tenantId },
      data: { leadAutoAssign: parsed.data.autoAssign },
      select: { leadAutoAssign: true },
    })

    return NextResponse.json({ data: { autoAssign: updated.leadAutoAssign } })
  },
)
