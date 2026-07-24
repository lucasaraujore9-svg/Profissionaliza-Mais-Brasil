import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import {
  resetStudentPassword,
  setStudentPasswordSchema,
} from "@/lib/students/management"
import { logAudit } from "@/lib/audit"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

export const POST = withRequestContextParams<{ id: string }>(
  {
    action: "painel.alunos.reset_password",
    route: "/api/painel/alunos/[id]/reset-password",
  },
  async (request: Request, { params }) => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const { id } = await params
    const student = await prisma.student.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    })
    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
    }

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

    const result = await resetStudentPassword(id, {
      tenantId: ctx.tenantId,
      newPassword,
    })
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    // Trilha de auditoria (SAAS-001): a senha em texto puro NUNCA vai ao payload.
    await logAudit({
      action: "student.password.reset",
      resource: "Student",
      resourceId: id,
      actorUserId: ctx.userId,
      actorRole: "RESELLER",
      tenantId: ctx.tenantId,
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
