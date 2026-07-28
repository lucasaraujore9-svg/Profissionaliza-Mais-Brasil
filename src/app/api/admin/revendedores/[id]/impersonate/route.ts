import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { startImpersonation } from "@/lib/auth/start-impersonation"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"
import { logAudit } from "@/lib/audit"
import { requireAdmin } from "@/lib/auth/admin-guard"

export const POST = withRequestContextParams<{ id: string }>(
  { action: "admin.revendedores.impersonate", route: "/api/admin/revendedores/[id]/impersonate" },
  async (_request: Request, { params }) => {
  const guard = await requireAdmin("unidades.impersonate")
  if (!guard.ok) return guard.response
  const admin = guard.ctx

  const { id: tenantId } = await params

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, slug: true, accountManagerId: true, salesUserId: true },
  })
  if (!tenant) {
    return NextResponse.json({ error: "Revendedor não encontrado" }, { status: 404 })
  }

  // `unidades.impersonate` ja garantiu o direito; aqui fica o recorte: quem não
  // enxerga a rede inteira só entra nas unidades da própria carteira.
  const allowed = await admin.canAccessTenant(tenant)
  if (!allowed) {
    contextLogger().warn(
      { event: "impersonate.denied", actorId: admin.userId, actorRole: admin.role, tenantId },
      "tentativa de impersonate de revenda sem permissão",
    )
    return NextResponse.json({ error: "Permissão negada" }, { status: 403 })
  }

  // Owner do tenant: usuário com role RESELLER e tenantId igual.
  const owner = await prisma.user.findFirst({
    where: { tenantId: tenant.id, role: "RESELLER" },
    select: { id: true, name: true, email: true, role: true, tenantId: true },
    orderBy: { createdAt: "asc" },
  })
  if (!owner) {
    return NextResponse.json(
      { error: "Este revendedor ainda não tem usuário responsável" },
      { status: 400 },
    )
  }

  await startImpersonation({
    target: {
      sub: owner.id,
      role: owner.role,
      tenantId: owner.tenantId,
      email: owner.email,
      name: owner.name,
    },
    actor: { userId: admin.userId, name: admin.name, email: admin.email },
    targetLabel: owner.name ?? owner.email ?? tenant.name,
  })

  await logAudit({
    action: "impersonation.start",
    resource: "Tenant",
    resourceId: tenant.id,
    actorUserId: admin.userId,
    actorRole: admin.role,
    actorEmail: admin.email,
    tenantId: tenant.id,
    payloadAfter: { targetUserId: owner.id, targetEmail: owner.email },
  })

  return NextResponse.json({ data: { redirect: "/painel" } })
  },
)
