import { NextResponse } from "next/server"
import { requirePmbTeam } from "@/lib/auth/guards"
import { resetStudentPassword } from "@/lib/students/management"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

export const POST = withRequestContextParams<{ id: string }>(
  { action: "admin.alunos.reset_password", route: "/api/admin/alunos/[id]/reset-password" },
  async (_request: Request, ctx) => {
    const guard = await requirePmbTeam()
    if (!guard.ok) return guard.response

    const { id } = await ctx.params
    const result = await resetStudentPassword(id)
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    return NextResponse.json({
      ok: true,
      tempPassword: result.tempPassword,
      emailSent: result.emailSent,
    })
  },
)
