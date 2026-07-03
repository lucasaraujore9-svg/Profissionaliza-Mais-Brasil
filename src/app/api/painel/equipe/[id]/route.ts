import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireResellerOwner } from "@/lib/auth/guards"
import { auth } from "@/lib/auth"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { logAudit } from "@/lib/audit"

async function currentTenantId(): Promise<string | null> {
  const session = await auth()
  const user = session?.user as { tenantId?: string | null } | undefined
  return user?.tenantId ?? null
}

const patchSchema = z.object({
  maxDiscount: z.number().int().min(0).max(100).nullable().optional(),
  status: z.enum(["ATIVO", "INATIVO"]).optional(),
})

export const PATCH = withRequestContextParams<{ id: string }>(
  { action: "painel.equipe.update", route: "/api/painel/equipe/[id]" },
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const tenantId = await currentTenantId()
    if (!tenantId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    const guard = await requireResellerOwner(tenantId)
    if (!guard.ok) return guard.response
    const { id } = await ctx.params

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
    }

    const member = await prisma.tenantMember.findUnique({ where: { id } })
    if (!member || member.tenantId !== tenantId) {
      return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
    }

    const updated = await prisma.tenantMember.update({
      where: { id },
      data: parsed.data,
    })

    // SAAS-001: trilha de auditoria da alteração de cap de desconto/status do
    // consultor — autoridade comercial da unidade.
    await logAudit({
      action: "tenant_member.update",
      resource: "TenantMember",
      resourceId: id,
      actorUserId: guard.session.userId,
      actorRole: guard.session.role,
      tenantId,
      payloadBefore: { maxDiscount: member.maxDiscount, status: member.status },
      payloadAfter: parsed.data,
    })

    return NextResponse.json({ data: updated })
  },
)

export const DELETE = withRequestContextParams<{ id: string }>(
  { action: "painel.equipe.delete", route: "/api/painel/equipe/[id]" },
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const tenantId = await currentTenantId()
    if (!tenantId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    const guard = await requireResellerOwner(tenantId)
    if (!guard.ok) return guard.response
    const { id } = await ctx.params

    const member = await prisma.tenantMember.findUnique({ where: { id } })
    if (!member || member.tenantId !== tenantId) {
      return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
    }

    await prisma.tenantMember.update({ where: { id }, data: { status: "INATIVO" } })

    // SAAS-001: trilha de auditoria da desativação de membro da equipe da unidade.
    await logAudit({
      action: "tenant_member.deactivate",
      resource: "TenantMember",
      resourceId: id,
      actorUserId: guard.session.userId,
      actorRole: guard.session.role,
      tenantId,
      payloadBefore: { status: member.status },
      payloadAfter: { status: "INATIVO" },
    })

    return NextResponse.json({ data: { id, status: "INATIVO" } })
  },
)
