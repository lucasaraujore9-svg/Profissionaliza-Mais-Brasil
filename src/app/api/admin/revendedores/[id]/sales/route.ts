import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/auth/guards"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { logAudit } from "@/lib/audit"

const schema = z.object({
  salesUserId: z.string().nullable(),
})

// Atribui (ou remove) o vendedor de revenda (PMB_REVENDA_SALES) de uma unidade.
// Espelha .../[id]/manager (gerente de suporte). SUPER_ADMIN apenas.
export const PATCH = withRequestContextParams<{ id: string }>(
  { action: "admin.revendedores.sales.update", route: "/api/admin/revendedores/[id]/sales" },
  async (req: Request, ctx) => {
    const guard = await requireSuperAdmin()
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

    if (parsed.data.salesUserId) {
      const seller = await prisma.user.findUnique({
        where: { id: parsed.data.salesUserId },
        select: { role: true, status: true },
      })
      if (!seller || seller.role !== "PMB_REVENDA_SALES" || seller.status !== "ATIVO") {
        return NextResponse.json(
          { error: "Vendedor de revenda inválido ou inativo" },
          { status: 400 },
        )
      }
    }

    const before = await prisma.tenant.findUnique({
      where: { id },
      select: { salesUserId: true },
    })

    const updated = await prisma.tenant.update({
      where: { id },
      data: { salesUserId: parsed.data.salesUserId },
      select: {
        id: true,
        salesUserId: true,
        salesUser: { select: { id: true, name: true } },
      },
    })

    // SAAS-001: trilha de auditoria do vínculo de vendedor de revenda à unidade.
    await logAudit({
      action: "tenant.sales.update",
      resource: "Tenant",
      resourceId: id,
      actorUserId: guard.session.userId,
      actorRole: guard.session.role,
      tenantId: id,
      payloadBefore: { salesUserId: before?.salesUserId ?? null },
      payloadAfter: { salesUserId: updated.salesUserId },
    })

    return NextResponse.json({ data: updated })
  },
)
