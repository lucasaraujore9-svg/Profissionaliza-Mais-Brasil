import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireStudentSession } from "@/lib/auth/student-session"
import { createLmsSsoToken } from "@/lib/lms"
import { contextLogger } from "@/lib/logger"

/**
 * Abre o curso do LMS para o aluno. Ramifica por `lmsPlayback`:
 *  - "redirect" (curso de parceiro): redireciona ao portal do parceiro
 *    (lmsPortalUrl); o aluno loga com as credenciais exibidas na area do aluno.
 *  - "local"/null (curso proprio do LMS): gera link SSO de uso unico (TTL ~5min,
 *    sob demanda no clique) e redireciona ao player. `null` cobre matriculas
 *    anteriores a migration de credenciais (tratadas como local/SSO).
 *
 * So vale para cursos provider=LMS de matriculas ACTIVE/COMPLETED do proprio aluno.
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
      lmsPlayback: true,
      lmsPortalUrl: true,
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

  // Curso de parceiro (redirect): assiste no portal do parceiro com as
  // credenciais exibidas na area do aluno — nao geramos SSO do LMS. portalUrl
  // vem do banco (nunca do client).
  if (enrollment.lmsPlayback === "redirect") {
    if (enrollment.lmsPortalUrl) {
      return NextResponse.redirect(enrollment.lmsPortalUrl)
    }
    return NextResponse.json(
      { error: "Acesso ao parceiro indisponível no momento — fale com o suporte." },
      { status: 409 },
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
