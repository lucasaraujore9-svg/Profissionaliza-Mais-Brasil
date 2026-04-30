import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import {
  linkCourseToStudent,
  unlinkCourseFromStudent,
} from "@/lib/students/ea-actions"
import {
  EAApiError,
  EANetworkError,
} from "@/lib/escola-avancada/errors"

const linkSchema = z.object({
  courseId: z.string().cuid(),
})

interface Ctx {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, ctx: Ctx) {
  const session = await requireAdminSession()
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }
  const { id } = await ctx.params

  const enrollments = await prisma.enrollment.findMany({
    where: { studentId: id },
    orderBy: { createdAt: "desc" },
    include: {
      course: {
        select: { id: true, nome: true, eaCourseId: true, status: true },
      },
    },
  })

  return NextResponse.json({
    data: enrollments.map((e) => ({
      enrollmentId: e.id,
      courseId: e.course.id,
      courseName: e.course.nome,
      eaCourseId: e.course.eaCourseId,
      status: e.status,
      gateway: e.gateway,
      createdAt: e.createdAt.toISOString(),
    })),
  })
}

/**
 * Vincula manualmente um curso ao aluno na plataforma de aulas.
 * Toda a interacao com a EA passa pelo modulo unificado em
 * src/lib/students/ea-actions.ts — exatamente o mesmo caminho usado pelo
 * fluxo automatico de venda. Para a EA nao ha distincao entre venda PMB,
 * venda revendedor e concessao manual.
 */
export async function POST(request: Request, ctx: Ctx) {
  const session = await requireAdminSession()
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }
  if (session.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Apenas SUPER_ADMIN pode vincular cursos manualmente" },
      { status: 403 },
    )
  }

  const { id: studentId } = await ctx.params

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const parsed = linkSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: "courseId inválido" }, { status: 400 })
  }

  const [studentExists, course] = await Promise.all([
    prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, nome: true },
    }),
    prisma.course.findUnique({
      where: { id: parsed.data.courseId },
      select: { id: true, nome: true, eaCourseId: true },
    }),
  ])

  if (!studentExists) {
    return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
  }
  if (!course) {
    return NextResponse.json({ error: "Curso não encontrado" }, { status: 404 })
  }

  try {
    const result = await linkCourseToStudent(studentId, course.id)
    return NextResponse.json({
      data: {
        ok: true,
        eaAlunoId: String(result.eaAlunoId),
        eaCourseId: String(result.eaCourseId),
        courseName: course.nome,
      },
    })
  } catch (error) {
    const message =
      error instanceof EAApiError
        ? error.apiError ?? error.message
        : error instanceof EANetworkError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Falha ao integrar com a plataforma de aulas"
    console.error("[admin/alunos/cursos] POST falhou:", error)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

/**
 * Desvincula manualmente um curso do aluno na plataforma de aulas.
 * Body: { courseId } (cuid do curso interno).
 */
export async function DELETE(request: Request, ctx: Ctx) {
  const session = await requireAdminSession()
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }
  if (session.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Apenas SUPER_ADMIN pode desvincular cursos" },
      { status: 403 },
    )
  }

  const { id: studentId } = await ctx.params
  const url = new URL(request.url)
  const courseId = url.searchParams.get("courseId")
  if (!courseId) {
    return NextResponse.json({ error: "courseId obrigatório" }, { status: 400 })
  }

  try {
    await unlinkCourseFromStudent(studentId, courseId)
    return NextResponse.json({ data: { ok: true } })
  } catch (error) {
    const message =
      error instanceof EAApiError
        ? error.apiError ?? error.message
        : error instanceof EANetworkError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Falha ao desvincular curso"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
