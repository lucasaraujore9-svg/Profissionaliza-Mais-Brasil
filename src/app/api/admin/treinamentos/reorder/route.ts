import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/auth/guards"
import { withRequestContext } from "@/lib/observability/with-request-context"

// Reordena modulos ou videos. O client envia a lista completa de ids na nova
// ordem; gravamos `position` = indice numa transacao.
const bodySchema = z.object({
  scope: z.enum(["module", "video"]),
  orderedIds: z.array(z.string().min(1)).min(1).max(500),
})

export const POST = withRequestContext(
  { action: "admin.treinamentos.reorder", route: "/api/admin/treinamentos/reorder" },
  async (request: Request) => {
    const guard = await requireSuperAdmin()
    if (!guard.ok) return guard.response

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
    const { scope, orderedIds } = parsed.data

    await prisma.$transaction(
      orderedIds.map((id, index) =>
        scope === "module"
          ? prisma.trainingModule.update({ where: { id }, data: { position: index } })
          : prisma.trainingVideo.update({ where: { id }, data: { position: index } }),
      ),
    )

    return NextResponse.json({ data: { ok: true } })
  },
)
