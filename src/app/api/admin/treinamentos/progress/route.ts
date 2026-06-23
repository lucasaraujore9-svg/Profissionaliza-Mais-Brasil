import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { withRequestContext } from "@/lib/observability/with-request-context"

// POST /api/admin/treinamentos/progress — marca/desmarca uma aula como assistida
// pelo membro da equipe PMB logado. Espelha /api/painel/treinamentos/progress
// (mesma tabela TrainingProgress, chaveada por userId) mas aceita qualquer papel
// da equipe interna (não só RESELLER), pois os treinamentos são globais.
const bodySchema = z.object({
  videoId: z.string().trim().min(1),
  completed: z.boolean(),
})

export const POST = withRequestContext(
  { action: "admin.treinamentos.progress", route: "/api/admin/treinamentos/progress" },
  async (request: Request) => {
    const session = await requireAdminSession()
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const parsed = bodySchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const { videoId, completed } = parsed.data

    // So aceita videos publicados de modulos publicados.
    const video = await prisma.trainingVideo.findFirst({
      where: { id: videoId, published: true, module: { published: true } },
      select: { id: true },
    })
    if (!video) {
      return NextResponse.json({ error: "Treinamento não encontrado" }, { status: 404 })
    }

    if (completed) {
      await prisma.trainingProgress.upsert({
        where: { userId_videoId: { userId: session.userId, videoId } },
        create: { userId: session.userId, videoId },
        update: {},
      })
    } else {
      await prisma.trainingProgress.deleteMany({
        where: { userId: session.userId, videoId },
      })
    }

    return NextResponse.json({ data: { videoId, completed } })
  },
)
