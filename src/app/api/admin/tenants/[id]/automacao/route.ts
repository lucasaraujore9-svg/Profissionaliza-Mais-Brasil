import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { invalidateTenant } from "@/lib/redis/tenant-cache"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { DEFAULT_AUTOMATION_TEMPLATES } from "@/lib/automation/default-templates"
import { requireAdmin } from "@/lib/auth/admin-guard"

const bodySchema = z.object({
  enabled: z.boolean(),
})

export const PUT = withRequestContextParams<{ id: string }>(
  {
    action: "admin.tenants.automacao.update",
    route: "/api/admin/tenants/[id]/automacao",
  },
  async (request: Request, context) => {
    const guard = await requireAdmin("unidades.manage")
    if (!guard.ok) return guard.response
    const session = guard.ctx
    const { id } = await context.params

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }
    const parsed = bodySchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Dados inválidos",
          fields: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      )
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        customDomain: true,
        accountManagerId: true,
        salesUserId: true,
        automationEnabled: true,
      },
    })
    if (!tenant) {
      return NextResponse.json(
        { error: "Revendedor não encontrado" },
        { status: 404 },
      )
    }

    if (!(await session.canAccessTenant(tenant))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Na primeira ativacao, cria os templates default em transacao.
    const isFirstActivation = parsed.data.enabled && !tenant.automationEnabled
    const existingTemplateCount = isFirstActivation
      ? await prisma.automationMessageTemplate.count({
          where: { tenantId: id },
        })
      : 0

    const updated = await prisma.$transaction(async (tx) => {
      const updatedTenant = await tx.tenant.update({
        where: { id },
        data: { automationEnabled: parsed.data.enabled },
        select: {
          id: true,
          automationEnabled: true,
          waStatus: true,
          waConnectedPhone: true,
        },
      })

      if (isFirstActivation && existingTemplateCount === 0) {
        await tx.automationMessageTemplate.createMany({
          data: DEFAULT_AUTOMATION_TEMPLATES.map((t) => ({
            tenantId: id,
            key: t.key,
            body: t.body,
            enabled: true,
          })),
        })
      }

      return updatedTenant
    })

    await invalidateTenant({
      id: tenant.id,
      slug: tenant.slug,
      customDomain: tenant.customDomain,
    })

    return NextResponse.json({
      data: {
        id: updated.id,
        automationEnabled: updated.automationEnabled,
        waStatus: updated.waStatus,
        waConnectedPhone: updated.waConnectedPhone,
      },
    })
  },
)
