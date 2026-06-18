import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/auth/guards"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

const updateSchema = z
  .object({
    title: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    coverUrl: z.string().trim().url().max(500).nullable().optional(),
    published: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Nada para atualizar" })

// PATCH /api/admin/treinamentos/modules/[id] — edita campos / publica.
export const PATCH = withRequestContextParams<{ id: string }>(
  { action: "admin.treinamentos.modules.update", route: "/api/admin/treinamentos/modules/[id]" },
  async (request: Request, { params }) => {
    const guard = await requireSuperAdmin()
    if (!guard.ok) return guard.response

    const { id } = await params

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const parsed = updateSchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const data = parsed.data

    try {
      const updated = await prisma.trainingModule.update({
        where: { id },
        data: {
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.coverUrl !== undefined ? { coverUrl: data.coverUrl } : {}),
          ...(data.published !== undefined ? { published: data.published } : {}),
        },
        include: { videos: { orderBy: { position: "asc" } }, _count: { select: { videos: true } } },
      })
      return NextResponse.json({ data: { module: updated } })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
        return NextResponse.json({ error: "Módulo não encontrado" }, { status: 404 })
      }
      throw err
    }
  },
)

// DELETE /api/admin/treinamentos/modules/[id] — remove o modulo (videos em cascata).
export const DELETE = withRequestContextParams<{ id: string }>(
  { action: "admin.treinamentos.modules.delete", route: "/api/admin/treinamentos/modules/[id]" },
  async (_request: Request, { params }) => {
    const guard = await requireSuperAdmin()
    if (!guard.ok) return guard.response

    const { id } = await params

    try {
      await prisma.trainingModule.delete({ where: { id } })
      return NextResponse.json({ data: { ok: true } })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
        return NextResponse.json({ error: "Módulo não encontrado" }, { status: 404 })
      }
      throw err
    }
  },
)
