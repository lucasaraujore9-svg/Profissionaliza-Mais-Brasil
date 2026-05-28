import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { noteSchema } from "@/lib/students/management"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

export const GET = withRequestContextParams<{ id: string }>(
  { action: "painel.alunos.notes.list", route: "/api/painel/alunos/[id]/notes" },
  async (_request: Request, { params }) => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }
    const { id } = await params

    const student = await prisma.student.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    })
    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
    }

    const notes = await prisma.studentNote.findMany({
      where: { studentId: id },
      orderBy: { createdAt: "desc" },
      include: { author: { select: { id: true, name: true } } },
    })
    return NextResponse.json({
      data: notes.map((n) => ({
        id: n.id,
        body: n.body,
        createdAt: n.createdAt.toISOString(),
        authorId: n.author.id,
        authorName: n.author.name,
      })),
    })
  },
)

export const POST = withRequestContextParams<{ id: string }>(
  { action: "painel.alunos.notes.create", route: "/api/painel/alunos/[id]/notes" },
  async (request: Request, { params }) => {
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
    const parsed = noteSchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", issues: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const student = await prisma.student.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    })
    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
    }

    const note = await prisma.studentNote.create({
      data: {
        studentId: id,
        authorId: ctx.userId,
        body: parsed.data.body,
      },
      include: { author: { select: { id: true, name: true } } },
    })

    return NextResponse.json({
      ok: true,
      note: {
        id: note.id,
        body: note.body,
        createdAt: note.createdAt.toISOString(),
        authorId: note.author.id,
        authorName: note.author.name,
      },
    })
  },
)

export const DELETE = withRequestContextParams<{ id: string }>(
  { action: "painel.alunos.notes.delete", route: "/api/painel/alunos/[id]/notes" },
  async (request: Request, { params }) => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const { id } = await params
    const url = new URL(request.url)
    const noteId = url.searchParams.get("noteId")
    if (!noteId) {
      return NextResponse.json({ error: "noteId obrigatório" }, { status: 400 })
    }

    // Garante tenant ownership: subquery em where exige student do tenant.
    const student = await prisma.student.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    })
    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
    }

    const result = await prisma.studentNote.deleteMany({
      where: { id: noteId, studentId: id, authorId: ctx.userId },
    })
    if (result.count === 0) {
      return NextResponse.json({ error: "Nota não encontrada" }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  },
)
