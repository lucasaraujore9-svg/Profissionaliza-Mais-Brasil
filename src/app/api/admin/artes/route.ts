import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireArtesManager } from "@/lib/auth/guards"
import { uploadVitrineAsset, deleteVitrineAsset } from "@/lib/supabase/storage"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { artExtensionFor, validateArtFile, withArtUrls } from "@/lib/artes/admin-upload"

// GET /api/admin/artes — lista todas (publicadas ou nao) na ordem de gestao.
export const GET = withRequestContext(
  { action: "admin.artes.list", route: "/api/admin/artes" },
  async () => {
    const guard = await requireArtesManager()
    if (!guard.ok) return guard.response

    const arts = await prisma.marketingArt.findMany({
      orderBy: { position: "asc" },
    })

    return NextResponse.json({ data: { arts: arts.map(withArtUrls) } })
  },
)

const createFieldsSchema = z.object({
  title: z.string().trim().min(2).max(120),
  category: z.string().trim().max(60).optional().nullable(),
  hasPrice: z.enum(["true", "false"]).default("false"),
  logoCorner: z.enum(["top-left", "top-right"]).default("top-right"),
})

// POST /api/admin/artes — multipart: cria a arte com a variante FEED
// (obrigatoria) e opcionalmente a variante STORIES no mesmo passo.
export const POST = withRequestContext(
  { action: "admin.artes.create", route: "/api/admin/artes" },
  async (request: Request) => {
    const guard = await requireArtesManager()
    if (!guard.ok) return guard.response

    const rl = await rateLimit(request, RATE_LIMITS.artesUpload)
    if (!rl.ok) return rateLimitResponse(rl)

    let form: FormData
    try {
      form = await request.formData()
    } catch {
      return NextResponse.json({ error: "Formato inválido" }, { status: 400 })
    }

    const feedFile = form.get("feedFile")
    if (!(feedFile instanceof File)) {
      return NextResponse.json({ error: "Arquivo de feed obrigatório" }, { status: 400 })
    }
    const storyRaw = form.get("storyFile")
    const storyFile = storyRaw instanceof File && storyRaw.size > 0 ? storyRaw : null

    const parsed = createFieldsSchema.safeParse({
      title: form.get("title") ?? "",
      category: form.get("category") || null,
      hasPrice: form.get("hasPrice") ?? "false",
      logoCorner: form.get("logoCorner") ?? "top-right",
    })
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const fields = parsed.data

    const feed = await validateArtFile(feedFile, "feed")
    if (!feed.ok) return feed.response
    const story = storyFile ? await validateArtFile(storyFile, "story") : null
    if (story && !story.ok) return story.response

    const feedPath = `artes/${randomUUID()}.${artExtensionFor(feedFile.type)}`
    const storyPath =
      storyFile && story?.ok ? `artes/${randomUUID()}-story.${artExtensionFor(storyFile.type)}` : null

    const uploaded: string[] = []
    try {
      await uploadVitrineAsset(feedPath, feed.buffer, feedFile.type)
      uploaded.push(feedPath)
      if (storyFile && storyPath && story?.ok) {
        await uploadVitrineAsset(storyPath, story.buffer, storyFile.type)
        uploaded.push(storyPath)
      }
    } catch (error) {
      // Upload parcial: limpa o que subiu para nao deixar orfao.
      for (const p of uploaded) {
        try {
          await deleteVitrineAsset(p)
        } catch {
          // best-effort
        }
      }
      const message = error instanceof Error ? error.message : "Erro no upload"
      return NextResponse.json(
        { error: `Falha ao enviar arquivo: ${message}` },
        { status: 502 },
      )
    }

    try {
      const last = await prisma.marketingArt.findFirst({
        orderBy: { position: "desc" },
        select: { position: true },
      })

      const created = await prisma.marketingArt.create({
        data: {
          title: fields.title,
          category: fields.category || null,
          filePath: feedPath,
          width: feed.width,
          height: feed.height,
          storyFilePath: storyPath,
          storyWidth: story?.ok ? story.width : null,
          storyHeight: story?.ok ? story.height : null,
          hasPrice: fields.hasPrice === "true",
          logoCorner: fields.logoCorner,
          position: (last?.position ?? -1) + 1,
        },
      })

      return NextResponse.json({ data: { art: withArtUrls(created) } }, { status: 201 })
    } catch (error) {
      // Create falhou apos o upload: best-effort para nao deixar orfaos.
      for (const p of uploaded) {
        try {
          await deleteVitrineAsset(p)
        } catch {
          // orfao no storage nao quebra o fluxo
        }
      }
      throw error
    }
  },
)
