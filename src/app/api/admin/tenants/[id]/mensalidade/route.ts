import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { invalidateTenant } from "@/lib/redis/tenant-cache"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { logAudit } from "@/lib/audit"

const bodySchema = z.object({
  monthlyAllowed: z.boolean(),
  monthlyScope: z.enum(["DIRECT_ONLY", "DIRECT_AND_VITRINE"]),
})

export const PUT = withRequestContextParams<{ id: string }>(
  {
    action: "admin.tenants.mensalidade.update",
    route: "/api/admin/tenants/[id]/mensalidade",
  },
  async (request: Request, context) => {
    const session = await requireAdminSession()
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }
    if (
      session.role !== "SUPER_ADMIN" &&
      session.role !== "PMB_RESELLER_MGR"
    ) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
    }

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
        monthlyAllowed: true,
        monthlyScope: true,
      },
    })
    if (!tenant) {
      return NextResponse.json(
        { error: "Revendedor não encontrado" },
        { status: 404 },
      )
    }

    if (
      session.role === "PMB_RESELLER_MGR" &&
      tenant.accountManagerId !== session.userId
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const updated = await prisma.tenant.update({
      where: { id },
      data: {
        monthlyAllowed: parsed.data.monthlyAllowed,
        monthlyScope: parsed.data.monthlyScope,
      },
      select: {
        id: true,
        monthlyAllowed: true,
        monthlyEnabled: true,
        monthlyScope: true,
      },
    })

    await invalidateTenant({
      id: tenant.id,
      slug: tenant.slug,
      customDomain: tenant.customDomain,
    })

    // SAAS-001: trilha de auditoria da mudança de capability de parcelamento.
    await logAudit({
      action: "tenant.monthly.update",
      resource: "Tenant",
      resourceId: id,
      actorUserId: session.userId,
      actorRole: session.role,
      tenantId: id,
      payloadBefore: {
        monthlyAllowed: tenant.monthlyAllowed,
        monthlyScope: tenant.monthlyScope,
      },
      payloadAfter: {
        monthlyAllowed: parsed.data.monthlyAllowed,
        monthlyScope: parsed.data.monthlyScope,
      },
    })

    return NextResponse.json({ data: updated })
  },
)
