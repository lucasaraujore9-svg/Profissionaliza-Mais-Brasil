import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { logAudit } from "@/lib/audit"
import { requireAdmin } from "@/lib/auth/admin-guard"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"

const schema = z.object({
  referrerTenantId: z.string().nullable(),
})

// Atribui (ou remove) a unidade INDICADORA desta unidade — para quando o
// código de indicação foi esquecido no cadastro. Espelha .../[id]/manager.
//
// Efeito no dinheiro: o fechamento mensal (lib/referrals/monthly.ts) apura
// pelo `referrerTenantId` VIGENTE — a mudança vale a partir da próxima
// apuração. Comissões já gravadas (qualquer motor) não são reescritas: elas
// pertencem ao indicador que constava quando foram geradas.
export const PATCH = withRequestContextParams<{ id: string }>(
  { action: "admin.revendedores.referrer.update", route: "/api/admin/revendedores/[id]/referrer" },
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
    const { referrerTenantId } = parsed.data

    const before = await prisma.tenant.findUnique({
      where: { id },
      select: { referrerTenantId: true },
    })
    if (!before) {
      return NextResponse.json({ error: "Unidade não encontrada" }, { status: 404 })
    }

    if (referrerTenantId) {
      if (referrerTenantId === id) {
        return NextResponse.json(
          { error: "A unidade não pode indicar a si mesma" },
          { status: 400 },
        )
      }
      const referrer = await prisma.tenant.findUnique({
        where: { id: referrerTenantId },
        select: { status: true, slug: true },
      })
      // Mesma regra do cadastro (validateReferralCode): PENDING pode indicar,
      // CANCELLED não. O placeholder da vitrine PMB nunca é indicador.
      if (
        !referrer ||
        referrer.status === "CANCELLED" ||
        referrer.slug === PMB_TENANT_SLUG
      ) {
        return NextResponse.json(
          { error: "Unidade indicadora inválida ou cancelada" },
          { status: 400 },
        )
      }
    }

    const updated = await prisma.tenant.update({
      where: { id },
      data: { referrerTenantId },
      select: {
        id: true,
        referrerTenantId: true,
        referrer: { select: { id: true, name: true, slug: true } },
      },
    })

    // SAAS-001: trilha de auditoria — a indicação decide para quem vai a
    // comissão de recorrência desta unidade.
    await logAudit({
      action: "tenant.referrer.update",
      resource: "Tenant",
      resourceId: id,
      actorUserId: guard.ctx.userId,
      actorRole: guard.ctx.role,
      tenantId: id,
      payloadBefore: { referrerTenantId: before.referrerTenantId },
      payloadAfter: { referrerTenantId: updated.referrerTenantId },
    })

    return NextResponse.json({ data: updated })
  },
)
