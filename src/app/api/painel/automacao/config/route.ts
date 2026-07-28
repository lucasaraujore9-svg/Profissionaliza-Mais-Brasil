import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { isTenantAutomationEnabled } from "@/lib/automation/context"

export const GET = withRequestContext(
  {
    action: "painel.automacao.config.get",
    route: "/api/painel/automacao/config",
  },
  async () => {
    const guard = await requirePainel("automacao.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: {
        automationEnabled: true,
        abandonedAfterHours: true,
        waStatus: true,
        waConnectedPhone: true,
      },
    })

    if (!tenant) {
      return NextResponse.json({ error: "Tenant não encontrado" }, { status: 404 })
    }

    return NextResponse.json({ data: tenant })
  },
)

const putSchema = z.object({
  abandonedAfterHours: z.number().int().min(1).max(168),
})

export const PUT = withRequestContext(
  {
    action: "painel.automacao.config.update",
    route: "/api/painel/automacao/config",
  },
  async (request: Request) => {
    const guard = await requirePainel("automacao.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    // SAAS-003: gate de entitlement no servidor (não confiar só na UI).
    if (!(await isTenantAutomationEnabled(ctx.tenantId))) {
      return NextResponse.json(
        {
          error: "Recurso disponível apenas no plano com Automação",
          code: "AUTOMATION_DISABLED",
        },
        { status: 403 },
      )
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
        {
          error: "Dados inválidos",
          fields: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      )
    }

    const updated = await prisma.tenant.update({
      where: { id: ctx.tenantId },
      data: { abandonedAfterHours: parsed.data.abandonedAfterHours },
      select: { abandonedAfterHours: true },
    })

    return NextResponse.json({ data: updated })
  },
)
