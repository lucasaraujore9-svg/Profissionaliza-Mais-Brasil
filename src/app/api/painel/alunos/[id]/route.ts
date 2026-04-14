import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireResellerSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const { id } = await params
  const student = await prisma.student.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: {
      enrollments: {
        include: {
          course: { select: { nome: true } },
          tenantCourse: { select: { price: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  })

  if (!student) {
    return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
  }

  const totalPaid = student.enrollments
    .filter((e) => e.status === "ACTIVE" || e.status === "COMPLETED")
    .reduce((sum, e) => sum + Number(e.finalAmount), 0)

  return NextResponse.json({
    data: {
      id: student.id,
      nome: student.nome,
      email: student.email,
      cpf: student.cpf,
      fone: student.fone,
      eaAlunoId: student.eaAlunoId,
      status: student.status,
      apostila: student.apostila,
      createdAt: student.createdAt.toISOString(),
      totalPaid,
      enrollments: student.enrollments.map((e) => ({
        id: e.id,
        courseName: e.course.nome,
        status: e.status,
        amount: Number(e.finalAmount),
        createdAt: e.createdAt.toISOString(),
        startedAt: e.startedAt?.toISOString() ?? null,
      })),
    },
  })
}
