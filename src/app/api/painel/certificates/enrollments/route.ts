import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { withRequestContext } from "@/lib/observability/with-request-context"

export const GET = withRequestContext(
  { action: "painel.certificates.enrollments", route: "/api/painel/certificates/enrollments" },
  async (request: Request) => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const url = new URL(request.url)
    const studentId = url.searchParams.get("studentId")
    if (!studentId) {
      return NextResponse.json({ error: "studentId obrigatório" }, { status: 400 })
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, tenantId: true, nome: true, cpf: true },
    })
    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
    }
    if (student.tenantId !== ctx.tenantId) {
      return NextResponse.json({ error: "Aluno de outro tenant" }, { status: 403 })
    }

    const enrollments = await prisma.enrollment.findMany({
      where: { studentId, tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
      include: {
        course: { select: { id: true, nome: true, cargaHoraria: true } },
        certificates: { select: { id: true, code: true, revokedAt: true } },
      },
      take: 50,
    })

    return NextResponse.json({
      data: {
        student: {
          id: student.id,
          nome: student.nome,
          cpf: student.cpf,
        },
        enrollments: enrollments.map((e) => ({
          id: e.id,
          status: e.status,
          courseName: e.course.nome,
          cargaHoraria: e.course.cargaHoraria,
          progressPercent: e.progressPercent ?? 0,
          progressStatus: e.progressStatus,
          hasActiveCertificate: e.certificates.some((c) => !c.revokedAt),
          createdAt: e.createdAt.toISOString(),
        })),
      },
    })
  },
)
