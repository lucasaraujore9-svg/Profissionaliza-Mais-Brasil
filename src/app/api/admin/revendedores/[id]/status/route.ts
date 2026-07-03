import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { invalidateTenant } from "@/lib/redis/tenant-cache"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { logAudit } from "@/lib/audit"

const schema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED", "PENDING", "CANCELLED"]),
})

export const PATCH = withRequestContextParams<{ id: string }>(
  { action: "admin.revendedores.status.update", route: "/api/admin/revendedores/[id]/status" },
  async (request: Request, { params }) => {
  const ctx = await requireAdminSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    select: { id: true, slug: true, customDomain: true, accountManagerId: true, status: true },
  })

  if (!tenant) {
    return NextResponse.json({ error: "Revendedor não encontrado" }, { status: 404 })
  }

  // Escopo de autorização: SUPER_ADMIN gerencia todos; PMB_RESELLER_MGR só os
  // revendedores que gerencia (accountManagerId); PMB_SALES não muda status.
  if (
    ctx.role !== "SUPER_ADMIN" &&
    !(ctx.role === "PMB_RESELLER_MGR" && tenant.accountManagerId === ctx.userId)
  ) {
    return NextResponse.json({ error: "Sem permissão para este revendedor" }, { status: 403 })
  }

  await prisma.tenant.update({
    where: { id },
    data: { status: parsed.data.status },
  })

  await invalidateTenant(tenant)

  // SAAS-001: trilha de auditoria da transição manual de lifecycle do tenant.
  await logAudit({
    action: "tenant.status.update",
    resource: "Tenant",
    resourceId: id,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    tenantId: id,
    payloadBefore: { status: tenant.status },
    payloadAfter: { status: parsed.data.status },
  })

  return NextResponse.json({ data: { status: parsed.data.status } })
  },
)
