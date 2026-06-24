import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireStudentSession } from "@/lib/auth/student-session"
import { withRequestContext } from "@/lib/observability/with-request-context"
import {
  createStudentSupportTicket,
  SUPPORT_STUDENT_SELECT,
} from "@/lib/support/student-support"

const schema = z.object({
  assunto: z.string().trim().min(3).max(120),
  mensagem: z.string().trim().min(10).max(2000),
})

export const POST = withRequestContext(
  { action: "aluno.suporte.create", route: "/api/aluno/suporte" },
  async (request: Request) => {
    const session = await requireStudentSession()
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const parsed = schema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", issues: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const student = await prisma.student.findUnique({
      where: { id: session.studentId },
      select: SUPPORT_STUDENT_SELECT,
    })
    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
    }

    // Persiste + roteia (caixa PMB ou da revenda) + notifica + e-mail. O
    // roteamento e o e-mail vivem no helper compartilhado com o webhook do LMS.
    await createStudentSupportTicket({
      student,
      assunto: parsed.data.assunto,
      mensagem: parsed.data.mensagem,
      source: "aluno",
    })

    return NextResponse.json({ ok: true })
  },
)
