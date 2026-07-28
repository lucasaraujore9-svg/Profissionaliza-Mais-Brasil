import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

// Reordena modulos ou videos. O client envia a lista completa de ids na nova
// ordem; gravamos `position` = indice com updates SEQUENCIAIS.
//
// DB-004: NAO usar prisma.$transaction([...map]) — o array dinamico de updates
// sobre @prisma/adapter-pg + pooler do Supabase lanca e derruba o lote inteiro
// em prod (o mesmo sintoma "nao salva" corrigido na edicao em massa, 019a253).
// position nao tem unique constraint, entao updates 1-a-1 sao seguros.
const bodySchema = z.object({
  scope: z.enum(["module", "video"]),
  orderedIds: z.array(z.string().min(1)).min(1).max(500),
})

export const POST = withRequestContext(
  { action: "admin.treinamentos.reorder", route: "/api/admin/treinamentos/reorder" },
  async (request: Request) => {
    const guard = await requireAdmin("treinamentos.manage")
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

    for (const [index, id] of orderedIds.entries()) {
      if (scope === "module") {
        await prisma.trainingModule.update({ where: { id }, data: { position: index } })
      } else {
        await prisma.trainingVideo.update({ where: { id }, data: { position: index } })
      }
    }

    return NextResponse.json({ data: { ok: true } })
  },
)
