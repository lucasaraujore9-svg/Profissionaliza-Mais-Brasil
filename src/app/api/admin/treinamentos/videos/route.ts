import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { extractYoutubeId } from "@/lib/training/youtube"
import { requireAdmin } from "@/lib/auth/admin-guard"

const createSchema = z.object({
  moduleId: z.string().trim().min(1),
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).optional().nullable(),
  // URL ou ID do YouTube — normalizado para o ID de 11 chars no servidor.
  youtube: z.string().trim().min(1).max(500),
  durationLabel: z.string().trim().max(12).optional().nullable(),
  published: z.boolean().optional(),
})

// POST /api/admin/treinamentos/videos — adiciona um video ao fim do modulo.
export const POST = withRequestContext(
  { action: "admin.treinamentos.videos.create", route: "/api/admin/treinamentos/videos" },
  async (request: Request) => {
    const guard = await requireAdmin("treinamentos.manage")
    if (!guard.ok) return guard.response

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const parsed = createSchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const data = parsed.data

    const youtubeId = extractYoutubeId(data.youtube)
    if (!youtubeId) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: { youtube: ["URL/ID do YouTube inválido"] } },
        { status: 400 },
      )
    }

    const parentModule = await prisma.trainingModule.findUnique({
      where: { id: data.moduleId },
      select: { id: true },
    })
    if (!parentModule) {
      return NextResponse.json({ error: "Módulo não encontrado" }, { status: 404 })
    }

    const last = await prisma.trainingVideo.findFirst({
      where: { moduleId: data.moduleId },
      orderBy: { position: "desc" },
      select: { position: true },
    })

    const video = await prisma.trainingVideo.create({
      data: {
        moduleId: data.moduleId,
        title: data.title,
        description: data.description ?? null,
        youtubeId,
        durationLabel: data.durationLabel || null,
        published: data.published ?? true,
        position: (last?.position ?? -1) + 1,
      },
    })

    return NextResponse.json({ data: { video } }, { status: 201 })
  },
)
