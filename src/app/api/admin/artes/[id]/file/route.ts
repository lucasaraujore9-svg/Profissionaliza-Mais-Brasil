import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { deleteVitrineAsset } from "@/lib/supabase/storage"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { validateUploadedArtObject, withArtUrls } from "@/lib/artes/admin-upload"
import { requireAdmin } from "@/lib/auth/admin-guard"

const bodySchema = z.object({
  kind: z.enum(["feed", "story"]),
  path: z.string().min(1),
})

// POST /api/admin/artes/[id]/file — JSON: troca (ou adiciona) o arquivo de UMA
// variante da arte, ja enviado direto ao Storage via signed URL (upload-url).
// Valida o objeto gravado, aponta o banco pro novo path e apaga o anterior.
export const POST = withRequestContextParams<{ id: string }>(
  { action: "admin.artes.file", route: "/api/admin/artes/[id]/file" },
  async (request: Request, { params }) => {
    const guard = await requireAdmin("artes.manage")
    if (!guard.ok) return guard.response

    const rl = await rateLimit(request, RATE_LIMITS.artesUpload)
    if (!rl.ok) return rateLimitResponse(rl)

    const { id } = await params

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
    const { kind, path } = parsed.data

    const art = await prisma.marketingArt.findUnique({
      where: { id },
      select: { filePath: true, storyFilePath: true },
    })
    if (!art) {
      // Objeto ja subiu mas a arte nao existe: limpa para nao deixar orfao.
      try {
        await deleteVitrineAsset(path)
      } catch {
        // best-effort
      }
      return NextResponse.json({ error: "Arte não encontrada" }, { status: 404 })
    }

    const validated = await validateUploadedArtObject(path, kind)
    if (!validated.ok) {
      try {
        await deleteVitrineAsset(path)
      } catch {
        // best-effort
      }
      return validated.response
    }

    const previousPath = kind === "feed" ? art.filePath : art.storyFilePath

    const updated = await prisma.marketingArt.update({
      where: { id },
      data:
        kind === "feed"
          ? { filePath: path, width: validated.width, height: validated.height }
          : { storyFilePath: path, storyWidth: validated.width, storyHeight: validated.height },
    })

    // Apaga o arquivo anterior da variante (best-effort, DB ja aponta pro novo).
    if (previousPath && previousPath !== path) {
      try {
        await deleteVitrineAsset(previousPath)
      } catch {
        // orfao no storage nao quebra o fluxo
      }
    }

    return NextResponse.json({ data: { art: withArtUrls(updated) } })
  },
)
