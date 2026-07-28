import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendInvite } from "@/lib/auth/invite"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { isPmbTeamRole } from "@/lib/auth/roles"
import { requireAdmin } from "@/lib/auth/admin-guard"

export const POST = withRequestContextParams<{ id: string }>(
  { action: "admin.equipe.resend_invite", route: "/api/admin/equipe/[id]/resend-invite" },
  async (_req: Request, ctx) => {
  const guard = await requireAdmin("equipe.manage")
  if (!guard.ok) return guard.response
  const { id } = await ctx.params

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true },
  })
  if (!user || !isPmbTeamRole(user.role)) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
  }

  const inviter = await prisma.user.findUnique({
    where: { id: guard.ctx.userId },
    select: { name: true },
  })

  await sendInvite({
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    inviterName: inviter?.name ?? "Equipe PMB",
    role: user.role,
    context: "pmb_team",
  })

  return NextResponse.json({ data: { ok: true } })
  },
)
