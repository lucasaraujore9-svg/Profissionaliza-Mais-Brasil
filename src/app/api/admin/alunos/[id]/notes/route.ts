import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requirePmbTeam } from "@/lib/auth/guards"
import { noteSchema } from "@/lib/students/management"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

export const GET = withRequestContextParams<{ id: string }>(
  { action: "admin.alunos.notes.list", route: "/api/admin/alunos/[id]/notes" },
  async (_request: Request, ctx) => {
    const guard = await requirePmbTeam()
    if (!guard.ok) return guard.response

    const { id } = await ctx.params
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
  { action: "admin.alunos.notes.create", route: "/api/admin/alunos/[id]/notes" },
  async (request: Request, ctx) => {
    const guard = await requirePmbTeam()
    if (!guard.ok) return guard.response

    const { id } = await ctx.params

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

    const studentExists = await prisma.student.findUnique({
      where: { id },
      select: { id: true },
    })
    if (!studentExists) {
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
    }

    const note = await prisma.studentNote.create({
      data: {
        studentId: id,
        authorId: guard.session.userId,
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
  { action: "admin.alunos.notes.delete", route: "/api/admin/alunos/[id]/notes" },
  async (request: Request, ctx) => {
    const guard = await requirePmbTeam()
    if (!guard.ok) return guard.response

    const { id } = await ctx.params
    const url = new URL(request.url)
    const noteId = url.searchParams.get("noteId")
    if (!noteId) {
      return NextResponse.json({ error: "noteId obrigatório" }, { status: 400 })
    }

    // Apaga apenas notas do proprio autor.
    const result = await prisma.studentNote.deleteMany({
      where: { id: noteId, studentId: id, authorId: guard.session.userId },
    })
    if (result.count === 0) {
      return NextResponse.json({ error: "Nota não encontrada" }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  },
)
