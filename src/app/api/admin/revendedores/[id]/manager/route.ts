import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { logAudit } from "@/lib/audit"
import { requireAdmin } from "@/lib/auth/admin-guard"

const schema = z.object({
  managerId: z.string().nullable(),
})

export const PATCH = withRequestContextParams<{ id: string }>(
  { action: "admin.revendedores.manager.update", route: "/api/admin/revendedores/[id]/manager" },
  async (req: Request, ctx) => {
  const guard = await requireAdmin("unidades.governanca")
  if (!guard.ok) return guard.response
  const { id } = await ctx.params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
  }

  if (parsed.data.managerId) {
    const mgr = await prisma.user.findUnique({
      where: { id: parsed.data.managerId },
      select: { role: true, status: true },
    })
    if (!mgr || mgr.role !== "PMB_RESELLER_MGR" || mgr.status !== "ATIVO") {
      return NextResponse.json(
        { error: "Gerente inválido ou inativo" },
        { status: 400 },
      )
    }
  }

  const before = await prisma.tenant.findUnique({
    where: { id },
    select: { accountManagerId: true },
  })

  const updated = await prisma.tenant.update({
    where: { id },
    data: { accountManagerId: parsed.data.managerId },
    select: {
      id: true,
      accountManagerId: true,
      accountManager: { select: { id: true, name: true } },
    },
  })

  // SAAS-001: trilha de auditoria do vínculo de gerente de conta à unidade.
  await logAudit({
    action: "tenant.manager.update",
    resource: "Tenant",
    resourceId: id,
    actorUserId: guard.ctx.userId,
    actorRole: guard.ctx.role,
    tenantId: id,
    payloadBefore: { accountManagerId: before?.accountManagerId ?? null },
    payloadAfter: { accountManagerId: updated.accountManagerId },
  })

  return NextResponse.json({ data: updated })
  },
)
