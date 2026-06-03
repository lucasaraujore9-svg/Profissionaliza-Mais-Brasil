import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { resendStudentPlatformCredentials } from "@/lib/students/plataforma-actions"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

export const POST = withRequestContextParams<{ id: string }>(
  {
    action: "painel.alunos.reenviar_email",
    route: "/api/painel/alunos/[id]/reenviar-email",
  },
  async (_request: Request, { params }) => {
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
