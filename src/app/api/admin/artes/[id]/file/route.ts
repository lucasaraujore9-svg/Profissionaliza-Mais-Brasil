import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireArtesManager } from "@/lib/auth/guards"
import { uploadVitrineAsset, deleteVitrineAsset } from "@/lib/supabase/storage"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { artExtensionFor, validateArtFile, withArtUrls } from "@/lib/artes/admin-upload"

// POST /api/admin/artes/[id]/file — troca (ou adiciona) o arquivo de UMA
// variante da arte: kind=feed|story. Usado para anexar a versao de stories a
// artes antigas e para corrigir um arquivo sem recriar a arte.
export const POST = withRequestContextParams<{ id: string }>(
  { action: "admin.artes.file", route: "/api/admin/artes/[id]/file" },
  async (request: Request, { params }) => {
    const guard = await requireArtesManager()
    if (!guard.ok) return guard.response

    const rl = await rateLimit(request, RATE_LIMITS.artesUpload)
    if (!rl.ok) return rateLimitResponse(rl)

    const { id } = await params

    let form: FormData
    try {
      form = await request.formData()
    } catch {
      return NextResponse.json({ error: "Formato inválido" }, { status: 400 })
    }

    const kindRaw = String(form.get("kind") ?? "")
    if (kindRaw !== "feed" && kindRaw !== "story") {
      return NextResponse.json({ error: "kind deve ser 'feed' ou 'story'" }, { status: 400 })
    }
    const kind = kindRaw
    const file = form.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Arquivo obrigatório" }, { status: 400 })
    }

    const art = await prisma.marketingArt.findUnique({
      where: { id },
      select: { filePath: true, storyFilePath: true },
    })
    if (!art) {
      return NextResponse.json({ error: "Arte não encontrada" }, { status: 404 })
    }

    const validated = await validateArtFile(file, kind)
    if (!validated.ok) return validated.response

    const suffix = kind === "story" ? "-story" : ""
    const path = `artes/${randomUUID()}${suffix}.${artExtensionFor(file.type)}`

    try {
      await uploadVitrineAsset(path, validated.buffer, file.type)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro no upload"
      return NextResponse.json(
        { error: `Falha ao enviar arquivo: ${message}` },
        { status: 502 },
      )
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
    if (previousPath) {
      try {
        await deleteVitrineAsset(previousPath)
      } catch {
        // orfao no storage nao quebra o fluxo
      }
    }

    return NextResponse.json({ data: { art: withArtUrls(updated) } })
  },
)
