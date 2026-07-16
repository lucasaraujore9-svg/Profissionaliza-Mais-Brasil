import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireArtesManager } from "@/lib/auth/guards"
import { deleteVitrineAsset } from "@/lib/supabase/storage"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { ART_PATH_RE, validateUploadedArtObject, withArtUrls } from "@/lib/artes/admin-upload"
import { artLayoutSchema } from "@/lib/artes/layout-schema"

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

// title min(1): o titulo padrao vem do nome do arquivo ("1.png" -> "1") — um
// caractere e valido.
const createSchema = z.object({
  title: z.string().trim().min(1).max(120),
  category: z.string().trim().max(60).optional().nullable(),
  hasPrice: z.boolean().default(false),
  logoCorner: z.enum(["top-left", "top-right"]).default("top-right"),
  feedPath: z.string().min(1),
  storyPath: z.string().min(1).optional().nullable(),
  // Posicoes de logo/preco + fundos definidos pelo designer no editor.
  layout: artLayoutSchema.optional().nullable(),
})

// POST /api/admin/artes — JSON: registra uma arte cujos arquivos ja foram
// enviados DIRETO ao Storage via signed URL (rota upload-url). Valida os
// objetos gravados (existencia, tamanho, magic bytes, proporcao) antes de
// criar a linha; em erro, apaga os objetos para nao deixar orfaos.
export const POST = withRequestContext(
  { action: "admin.artes.create", route: "/api/admin/artes" },
  async (request: Request) => {
    const guard = await requireArtesManager()
    if (!guard.ok) return guard.response

    const rl = await rateLimit(request, RATE_LIMITS.artesUpload)
    if (!rl.ok) return rateLimitResponse(rl)

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const parsed = createSchema.safeParse(payload)
    if (!parsed.success) {
      // Os arquivos JA estao no bucket (upload direto): limpa para nao deixar
      // orfaos quando o registro e rejeitado.
      const raw = payload as Record<string, unknown>
      for (const key of ["feedPath", "storyPath"] as const) {
        const p = raw?.[key]
        if (typeof p === "string" && ART_PATH_RE.test(p)) {
          try {
            await deleteVitrineAsset(p)
          } catch {
            // best-effort
          }
        }
      }
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const data = parsed.data

    const cleanupUploads = async () => {
      for (const p of [data.feedPath, data.storyPath]) {
        if (!p) continue
        try {
          await deleteVitrineAsset(p)
        } catch {
          // best-effort
        }
      }
    }

    const feed = await validateUploadedArtObject(data.feedPath, "feed")
    if (!feed.ok) {
      await cleanupUploads()
      return feed.response
    }
    let story: { width: number; height: number } | null = null
    if (data.storyPath) {
      const validated = await validateUploadedArtObject(data.storyPath, "story")
      if (!validated.ok) {
        await cleanupUploads()
        return validated.response
      }
      story = { width: validated.width, height: validated.height }
    }

    try {
      const last = await prisma.marketingArt.findFirst({
        orderBy: { position: "desc" },
        select: { position: true },
      })

      const created = await prisma.marketingArt.create({
        data: {
          title: data.title,
          category: data.category || null,
          filePath: data.feedPath,
          width: feed.width,
          height: feed.height,
          storyFilePath: data.storyPath ?? null,
          storyWidth: story?.width ?? null,
          storyHeight: story?.height ?? null,
          hasPrice: data.hasPrice,
          logoCorner: data.logoCorner,
          ...(data.layout ? { layout: data.layout } : {}),
          position: (last?.position ?? -1) + 1,
        },
      })

      return NextResponse.json({ data: { art: withArtUrls(created) } }, { status: 201 })
    } catch (error) {
      await cleanupUploads()
      throw error
    }
  },
)
