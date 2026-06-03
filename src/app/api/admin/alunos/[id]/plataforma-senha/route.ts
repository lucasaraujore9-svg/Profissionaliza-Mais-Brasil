import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePmbTeam } from "@/lib/auth/guards"
import { changeStudentPlatformPassword } from "@/lib/students/plataforma-actions"
import { generateTemporaryPassword } from "@/lib/students/generate-password"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

const bodySchema = z.object({
  newPassword: z.string().trim().min(6).max(60).optional(),
  generate: z.boolean().optional(),
})

export const POST = withRequestContextParams<{ id: string }>(
  {
    action: "admin.alunos.plataforma_senha",
    route: "/api/admin/alunos/[id]/plataforma-senha",
  },
  async (request: Request, ctx) => {
    const guard = await requirePmbTeam()
    if (!guard.ok) return guard.response

    const { id } = await ctx.params

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
    }

    const password =
      parsed.data.generate || !parsed.data.newPassword
        ? generateTemporaryPassword()
        : parsed.data.newPassword

    const result = await changeStudentPlatformPassword(id, password)
    if (!result.onPlatform) {
      return NextResponse.json(
        { error: "Aluno ainda não está na plataforma de aulas (sem matrícula paga)." },
        { status: 400 },
      )
    }

    return NextResponse.json({ ok: true, password })
  },
)
