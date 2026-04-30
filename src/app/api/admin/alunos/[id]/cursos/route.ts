import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import {
  criarAluno,
  vincularCurso,
  removerCurso,
} from "@/lib/escola-avancada/client"
import {
  EAApiError,
  EANetworkError,
} from "@/lib/escola-avancada/errors"
import { pmbEaPolo, pmbEaVendedorId } from "@/lib/pmb-config"

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
 * Vincula manualmente um curso a um aluno na plataforma de aulas.
 * - Se o aluno ainda nao existe na EA, cria primeiro (criarAluno).
 * - Depois chama vincularCurso.
 * NAO cria Enrollment local — use o fluxo de venda quando precisar de
 * registro financeiro. Este endpoint e para concessoes manuais (cortesia,
 * suporte, etc.).
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
    return NextResponse.json(
      { error: "courseId inválido" },
      { status: 400 },
    )
  }

  const [student, course] = await Promise.all([
    prisma.student.findUnique({
      where: { id: studentId },
      include: { tenant: { select: { slug: true, eaVendedorId: true } } },
    }),
    prisma.course.findUnique({
      where: { id: parsed.data.courseId },
      select: { id: true, nome: true, eaCourseId: true },
    }),
  ])

  if (!student) {
    return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
  }
  if (!course) {
    return NextResponse.json({ error: "Curso não encontrado" }, { status: 404 })
  }
  if (!course.eaCourseId) {
    return NextResponse.json(
      {
        error:
          "Curso sem ID na plataforma de aulas. Rode a sincronização do catálogo primeiro.",
      },
      { status: 400 },
    )
  }

  try {
    // Garante que o aluno existe na EA
    let eaLogin = student.eaAlunoId
    let eaSenha = student.eaAlunoSenha ?? ""
    const needsEACreation =
      !eaLogin ||
      eaLogin === "" ||
      eaLogin === "pending" ||
      Number.isNaN(Number.parseInt(eaLogin, 10))

    const tenantSlug =
      student.tenant.slug === "__pmb__" ? pmbEaPolo() : student.tenant.slug
    const tenantVendedor =
      student.tenant.slug === "__pmb__"
        ? pmbEaVendedorId()
        : student.tenant.eaVendedorId

    if (needsEACreation) {
      const created = await criarAluno({
        nome: student.nome,
        email: student.email ?? undefined,
        fone: student.fone ?? undefined,
        cpf: student.cpf ?? undefined,
        cidade: student.cidade ?? undefined,
        estado: student.estado ?? undefined,
        nascimento: student.nascimento
          ? student.nascimento.toISOString().slice(0, 10)
          : undefined,
        sexo: student.sexo ?? undefined,
        polo: tenantSlug,
        status: "ativo",
        apostila: "liberar",
        vendedor: tenantVendedor
          ? Number.parseInt(tenantVendedor, 10) || undefined
          : undefined,
      })
      eaLogin = String(created.login)
      eaSenha = String(created.senha)

      await prisma.student.update({
        where: { id: student.id },
        data: {
          eaAlunoId: eaLogin,
          eaAlunoSenha: eaSenha,
          status: "ATIVO",
          apostila: "LIBERADA",
          polo: tenantSlug,
          vendedorId: tenantVendedor ?? null,
        },
      })
    }

    const idAlunoEA = Number.parseInt(eaLogin ?? "", 10)
    const idCursoEA = Number.parseInt(course.eaCourseId, 10)
    if (!Number.isFinite(idAlunoEA) || !Number.isFinite(idCursoEA)) {
      return NextResponse.json(
        { error: "IDs inválidos para a plataforma de aulas" },
        { status: 500 },
      )
    }

    await vincularCurso({ aluno: idAlunoEA, idcurso: idCursoEA })

    return NextResponse.json({
      data: {
        ok: true,
        eaAlunoId: eaLogin,
        eaCourseId: course.eaCourseId,
        courseName: course.nome,
        createdInEA: needsEACreation,
      },
    })
  } catch (error) {
    const message =
      error instanceof EAApiError
        ? error.apiError ?? error.message
        : error instanceof EANetworkError
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

  const [student, course] = await Promise.all([
    prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, eaAlunoId: true },
    }),
    prisma.course.findUnique({
      where: { id: courseId },
      select: { eaCourseId: true, nome: true },
    }),
  ])

  if (!student || !course) {
    return NextResponse.json({ error: "Aluno ou curso não encontrado" }, { status: 404 })
  }
  if (!student.eaAlunoId || !course.eaCourseId) {
    return NextResponse.json(
      { error: "Aluno ou curso sem vínculo na plataforma de aulas" },
      { status: 400 },
    )
  }

  const idAlunoEA = Number.parseInt(student.eaAlunoId, 10)
  const idCursoEA = Number.parseInt(course.eaCourseId, 10)
  if (!Number.isFinite(idAlunoEA) || !Number.isFinite(idCursoEA)) {
    return NextResponse.json({ error: "IDs inválidos" }, { status: 500 })
  }

  try {
    await removerCurso({ aluno: idAlunoEA, idcurso: idCursoEA })
    return NextResponse.json({ data: { ok: true } })
  } catch (error) {
    const message =
      error instanceof EAApiError
        ? error.apiError ?? error.message
        : error instanceof EANetworkError
          ? error.message
          : "Falha ao desvincular curso"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
