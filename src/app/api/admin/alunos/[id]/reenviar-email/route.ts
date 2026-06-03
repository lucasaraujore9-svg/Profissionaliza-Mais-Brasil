import { NextResponse } from "next/server"
import { requirePmbTeam } from "@/lib/auth/guards"
import { resendStudentPlatformCredentials } from "@/lib/students/plataforma-actions"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

export const POST = withRequestContextParams<{ id: string }>(
  {
    action: "admin.alunos.reenviar_email",
    route: "/api/admin/alunos/[id]/reenviar-email",
  },
  async (_request: Request, ctx) => {
    const guard = await requirePmbTeam()
    if (!guard.ok) return guard.response

    const { id } = await ctx.params
    const result = await resendStudentPlatformCredentials(id)
    if (!result.onPlatform) {
      return NextResponse.json(
        { error: "Aluno ainda não está na plataforma de aulas (sem matrícula paga)." },
        { status: 400 },
      )
    }

    return NextResponse.json({ ok: true })
  },
)
