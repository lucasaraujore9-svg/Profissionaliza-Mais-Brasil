import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireResellerOwner } from "@/lib/auth/guards"
import { auth } from "@/lib/auth"
import { sendInvite } from "@/lib/auth/invite"
import { tenantEmailBrand } from "@/lib/email/brand"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

async function currentTenantId(): Promise<string | null> {
  const session = await auth()
  const user = session?.user as { tenantId?: string | null } | undefined
  return user?.tenantId ?? null
}

export const POST = withRequestContextParams<{ id: string }>(
  { action: "painel.equipe.resend_invite", route: "/api/painel/equipe/[id]/resend-invite" },
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const tenantId = await currentTenantId()
    if (!tenantId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    const guard = await requireResellerOwner(tenantId)
    if (!guard.ok) return guard.response
    const { id } = await ctx.params

    const member = await prisma.tenantMember.findUnique({
      where: { id },
      include: {
        user: true,
        tenant: {
          select: {
            name: true,
            slug: true,
            logoUrl: true,
            customDomain: true,
            supportEmail: true,
          },
        },
      },
    })
    if (!member || member.tenantId !== tenantId) {
      return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
    }

    const inviter = await prisma.user.findUnique({
      where: { id: guard.session.userId },
      select: { name: true },
    })

    await sendInvite({
      userId: member.user.id,
      userName: member.user.name,
      userEmail: member.user.email,
      inviterName: inviter?.name ?? "Equipe",
      role: member.role,
      context: "reseller_consultant",
      tenantName: member.tenant.name,
      brand: tenantEmailBrand(member.tenant),
    })

    return NextResponse.json({ data: { ok: true } })
  },
)
