import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { getOrCreatePmbTenant } from "@/lib/pmb-tenant"
import {
  linkCourseToStudent,
  unlinkCourseFromStudent,
} from "@/lib/students/plataforma-actions"
import { contextLogger } from "@/lib/logger"
import {
  EAApiError,
  EANetworkError,
} from "@/lib/plataforma-cursos/errors"
import { createNotification } from "@/lib/notifications"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

const linkSchema = z.object({
  courseId: z.string().cuid(),
})

async function assertPmbStudent(
  studentId: string,
): Promise<{ id: string } | null> {
  const pmbTenant = await getOrCreatePmbTenant()
  return prisma.student.findFirst({
    where: { id: studentId, tenantId: pmbTenant.id },
    select: { id: true },
  })
}

export const GET = withRequestContextParams<{ id: string }>(
  { action: "admin.alunos.cursos.list", route: "/api/admin/alunos/[id]/cursos" },
  async (_request: Request, ctx) => {
  const session = await requireAdminSession()
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }
  const { id } = await ctx.params

  const pmbStudent = await assertPmbStudent(id)
  if (!pmbStudent) {
    return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
  }

  const enrollments = await prisma.enrollment.findMany({
    where: { studentId: id, tenantId: null },
    orderBy: { createdAt: "desc" },
    include: {
      course: {
        select: { id: true, nome: true, plataformaCourseId: true, status: true },
      },
    },
  })

  return NextResponse.json({
    data: enrollments.map((e) => ({
      enrollmentId: e.id,
      courseId: e.course.id,
      courseName: e.course.nome,
      plataformaCourseId: e.course.plataformaCourseId,
      status: e.status,
      gateway: e.gateway,
      createdAt: e.createdAt.toISOString(),
    })),
  })
  },
)

/**
 * Vincula manualmente um curso ao aluno na plataforma de aulas.
 * Toda a interacao com a plataforma passa pelo modulo unificado em
 * src/lib/students/plataforma-actions.ts — exatamente o mesmo caminho usado pelo
 * fluxo automatico de venda. Para na plataforma nao ha distincao entre venda PMB,
 * venda revendedor e concessao manual.
 */
export const POST = withRequestContextParams<{ id: string }>(
  { action: "admin.alunos.cursos.link", route: "/api/admin/alunos/[id]/cursos" },
  async (request: Request, ctx) => {
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

  const pmbTenant = await getOrCreatePmbTenant()
  const [studentExists, course] = await Promise.all([
    prisma.student.findFirst({
      where: { id: studentId, tenantId: pmbTenant.id },
      select: { id: true, nome: true },
    }),
    prisma.course.findUnique({
      where: { id: parsed.data.courseId },
      select: { id: true, nome: true, plataformaCourseId: true },
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

    await createNotification({
      audience: "STUDENT",
      studentId,
      level: "SUCCESS",
      title: `Você foi inscrito em ${course.nome}`,
      body: "Vinculação manual liberada pelo administrador. Acesse a área de aulas.",
      category: "enrollment",
      href: "/aluno/cursos",
    })

    return NextResponse.json({
      data: {
        ok: true,
        plataformaAlunoId: String(result.plataformaAlunoId),
        plataformaCourseId: String(result.plataformaCourseId),
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
    contextLogger().error(
      { err: error, event: "admin.alunos.cursos.link_failed" },
      "POST /admin/alunos/[id]/cursos falhou",
    )
    return NextResponse.json({ error: message }, { status: 502 })
  }
  },
)

/**
 * Desvincula manualmente um curso do aluno na plataforma de aulas.
 * Body: { courseId } (cuid do curso interno).
 */
export const DELETE = withRequestContextParams<{ id: string }>(
  { action: "admin.alunos.cursos.unlink", route: "/api/admin/alunos/[id]/cursos" },
  async (request: Request, ctx) => {
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

  const pmbStudent = await assertPmbStudent(studentId)
  if (!pmbStudent) {
    return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
  }

  try {
    await unlinkCourseFromStudent(studentId, courseId)

    const removedCourse = await prisma.course.findUnique({
      where: { id: courseId },
      select: { nome: true },
    })
    await createNotification({
      audience: "STUDENT",
      studentId,
      level: "WARNING",
      title: `Curso ${removedCourse?.nome ?? "removido"} foi desvinculado`,
      body: "Acesso ao curso foi removido pelo administrador. Em caso de dúvida, fale com o suporte.",
      category: "enrollment",
      href: "/aluno/cursos",
    })

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
  },
)
