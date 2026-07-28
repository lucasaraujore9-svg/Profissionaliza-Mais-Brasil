import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { withRequestContext } from "@/lib/observability/with-request-context"

// POST /api/painel/treinamentos/progress — marca/desmarca uma aula como assistida
// pelo usuario logado (dono ou consultor da unidade).
const bodySchema = z.object({
  videoId: z.string().trim().min(1),
  completed: z.boolean(),
})

export const POST = withRequestContext(
  { action: "painel.treinamentos.progress", route: "/api/painel/treinamentos/progress" },
  async (request: Request) => {
    const guard = await requirePainel("treinamentos.view")
    if (!guard.ok) return guard.response
    const { ctx } = guard
    const session = ctx

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
