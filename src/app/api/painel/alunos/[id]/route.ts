import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { applyStudentEdit, editSchema } from "@/lib/students/management"
import {
  deriveStudentDisplayStatus,
  countEnrollmentStatuses,
} from "@/lib/students/display-status"

export const GET = withRequestContextParams<{ id: string }>(
  { action: "painel.alunos.get", route: "/api/painel/alunos/[id]" },
  async (
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
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
        plataformaAlunoId: student.plataformaAlunoId,
        status: deriveStudentDisplayStatus(
          student.status,
          countEnrollmentStatuses(student.enrollments),
        ),
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
  },
)

/**
 * PATCH /api/painel/alunos/[id] — edita dados do aluno do proprio tenant.
 */
export const PATCH = withRequestContextParams<{ id: string }>(
  { action: "painel.alunos.update", route: "/api/painel/alunos/[id]" },
  async (
    request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const { id } = await params

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const parsed = editSchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", issues: parsed.error.flatten() },
        { status: 400 },
      )
    }

    try {
      // Escopo autoritativo por tenant: nenhum id forjado alcança aluno de
      // outra loja. Devolve false se o id não pertence a este tenant.
      const updated = await applyStudentEdit(id, parsed.data, ctx.tenantId)
      if (!updated) {
        return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
      }
    } catch (err) {
      const msg = (err as Error).message ?? "Falha ao salvar"
      return NextResponse.json({ error: msg }, { status: 409 })
    }

    return NextResponse.json({ ok: true })
  },
)
