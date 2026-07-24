import { NextResponse } from "next/server"
import { requirePmbTeam } from "@/lib/auth/guards"
import {
  resetStudentPassword,
  setStudentPasswordSchema,
} from "@/lib/students/management"
import { logAudit } from "@/lib/audit"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

export const POST = withRequestContextParams<{ id: string }>(
  { action: "admin.alunos.reset_password", route: "/api/admin/alunos/[id]/reset-password" },
  async (request: Request, ctx) => {
    const guard = await requirePmbTeam()
    if (!guard.ok) return guard.response

    const { id } = await ctx.params

    // Corpo opcional: sem corpo (ou `generate: true`) mantem o comportamento
    // historico de gerar uma senha temporaria aleatoria.
    const parsed = setStudentPasswordSchema.safeParse(
      await request.json().catch(() => ({})),
    )
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const newPassword = parsed.data.generate ? undefined : parsed.data.newPassword

    const result = await resetStudentPassword(id, { newPassword })
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    // Trilha de auditoria (SAAS-001): a senha em texto puro NUNCA vai ao payload.
    await logAudit({
      action: "student.password.reset",
      resource: "Student",
      resourceId: id,
      actorUserId: guard.session.userId,
      actorRole: guard.session.role,
      payloadAfter: { generated: result.generated, emailSent: result.emailSent },
    })

    return NextResponse.json({
      ok: true,
      tempPassword: result.tempPassword,
      emailSent: result.emailSent,
      generated: result.generated,
    })
  },
)
