import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireStudentSession } from "@/lib/auth/student-session"
import { createLmsSsoToken } from "@/lib/lms"
import { contextLogger } from "@/lib/logger"

/**
 * Gera um link SSO de uso unico no LMS e redireciona o aluno para o player.
 *
 * So vale para cursos provider=LMS de matriculas ACTIVE/COMPLETED do proprio
 * aluno (o LMS exige o aluno matriculado antes). O token tem TTL ~5min e e
 * gerado SOB DEMANDA no clique — nunca pre-gerado/cacheado.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ enrollmentId: string }> },
) {
  const session = await requireStudentSession()
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  const { enrollmentId } = await params

  const enrollment = await prisma.enrollment.findFirst({
    where: {
      id: enrollmentId,
      studentId: session.studentId,
      status: { in: ["ACTIVE", "COMPLETED"] },
    },
    select: {
      tenantId: true,
      student: { select: { id: true } },
      course: { select: { provider: true } },
    },
  })

  if (!enrollment || enrollment.course.provider !== "LMS") {
    return NextResponse.json(
      { error: "Curso não disponível para acesso." },
      { status: 404 },
    )
  }

  try {
    const { url } = await createLmsSsoToken({
      studentExternalId: enrollment.student.id,
      tenantExternalId: enrollment.tenantId ?? undefined,
      returnUrl: new URL("/aluno/cursos", request.url).toString(),
    })
    return NextResponse.redirect(url)
  } catch (err) {
    contextLogger().error(
      { err, event: "aluno.lms_sso.failed", enrollmentId, studentId: session.studentId },
      "geracao de token SSO do LMS falhou",
    )
    return NextResponse.json(
      { error: "Não foi possível abrir o curso agora. Tente novamente em instantes." },
      { status: 502 },
    )
  }
}
