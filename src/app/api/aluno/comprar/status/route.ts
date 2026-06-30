import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireStudentSession } from "@/lib/auth/student-session"
import { withRequestContext } from "@/lib/observability/with-request-context"

/**
 * Polling do status de uma recompra do aluno (PIX/boleto). O webhook do gateway
 * efetiva a matrícula (status ACTIVE) quando o pagamento cai; aqui só lemos o
 * estado já persistido, escopado ao PRÓPRIO aluno (sessão) para evitar IDOR.
 */
export const GET = withRequestContext(
  { action: "aluno.comprar.status", route: "/api/aluno/comprar/status" },
  async (request: Request) => {
    const session = await requireStudentSession()
    if (!session) {
      return NextResponse.json({ error: "Não autenticado", code: "UNAUTHENTICATED" }, { status: 401 })
    }

    const url = new URL(request.url)
    const enrollmentId = url.searchParams.get("enrollment_id")
    if (!enrollmentId) {
      return NextResponse.json(
        { error: "enrollment_id obrigatório", code: "MISSING_ID" },
        { status: 400 },
      )
    }

    const enrollment = await prisma.enrollment.findFirst({
      where: { id: enrollmentId, studentId: session.studentId },
      select: { id: true, status: true },
    })
    if (!enrollment) {
      return NextResponse.json(
        { error: "Matrícula não encontrada", code: "NOT_FOUND" },
        { status: 404 },
      )
    }

    return NextResponse.json({
      data: {
        enrollmentId: enrollment.id,
        status: enrollment.status,
        paid:
          enrollment.status === "ACTIVE" || enrollment.status === "COMPLETED",
      },
    })
  },
)

export const dynamic = "force-dynamic"
