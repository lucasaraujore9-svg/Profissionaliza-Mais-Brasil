import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/auth/guards"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { extractYoutubeId } from "@/lib/training/youtube"

const updateSchema = z
  .object({
    title: z.string().trim().min(2).max(160).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    youtube: z.string().trim().min(1).max(500).optional(),
    durationLabel: z.string().trim().max(12).nullable().optional(),
    published: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Nada para atualizar" })

// PATCH /api/admin/treinamentos/videos/[id]
export const PATCH = withRequestContextParams<{ id: string }>(
  { action: "admin.treinamentos.videos.update", route: "/api/admin/treinamentos/videos/[id]" },
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

    let youtubeId: string | undefined
    if (data.youtube !== undefined) {
      const parsedId = extractYoutubeId(data.youtube)
      if (!parsedId) {
        return NextResponse.json(
          { error: "Dados inválidos", fields: { youtube: ["URL/ID do YouTube inválido"] } },
          { status: 400 },
        )
      }
      youtubeId = parsedId
    }

    try {
      const video = await prisma.trainingVideo.update({
        where: { id },
        data: {
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(youtubeId !== undefined ? { youtubeId } : {}),
          ...(data.durationLabel !== undefined ? { durationLabel: data.durationLabel || null } : {}),
          ...(data.published !== undefined ? { published: data.published } : {}),
        },
      })
      return NextResponse.json({ data: { video } })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
        return NextResponse.json({ error: "Treinamento não encontrado" }, { status: 404 })
      }
      throw err
    }
  },
)

// DELETE /api/admin/treinamentos/videos/[id]
export const DELETE = withRequestContextParams<{ id: string }>(
  { action: "admin.treinamentos.videos.delete", route: "/api/admin/treinamentos/videos/[id]" },
  async (_request: Request, { params }) => {
    const guard = await requireSuperAdmin()
    if (!guard.ok) return guard.response

    const { id } = await params

    try {
      await prisma.trainingVideo.delete({ where: { id } })
      return NextResponse.json({ data: { ok: true } })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
        return NextResponse.json({ error: "Treinamento não encontrado" }, { status: 404 })
      }
      throw err
    }
  },
)
