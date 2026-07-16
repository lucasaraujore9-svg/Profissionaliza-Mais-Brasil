import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireArtesManager } from "@/lib/auth/guards"
import { uploadVitrineAsset, deleteVitrineAsset, publicUrlFor } from "@/lib/supabase/storage"
import { isValidImageMagic } from "@/lib/storage/validate-image"
import { checkArtDimensions } from "@/lib/storage/image-dims"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { withRequestContext } from "@/lib/observability/with-request-context"

// Artes sao posts/stories em PNG que passam facil de 5MB — teto proprio de 10MB
// (o maxSide de 4096px em checkArtDimensions segura o peso real).
const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
])

function extensionFor(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png"
    case "image/jpeg":
    case "image/jpg":
      return "jpg"
    case "image/webp":
      return "webp"
    default:
      return "bin"
  }
}

// GET /api/admin/artes — lista todas (publicadas ou nao) na ordem de gestao.
export const GET = withRequestContext(
  { action: "admin.artes.list", route: "/api/admin/artes" },
  async () => {
    const guard = await requireArtesManager()
    if (!guard.ok) return guard.response

    const arts = await prisma.marketingArt.findMany({
      orderBy: { position: "asc" },
    })

    return NextResponse.json({
      data: {
        arts: arts.map((art) => ({ ...art, publicUrl: publicUrlFor(art.filePath) })),
      },
    })
  },
)

const createFieldsSchema = z.object({
  title: z.string().trim().min(2).max(120),
  category: z.string().trim().max(60).optional().nullable(),
  hasPrice: z.enum(["true", "false"]).default("false"),
  logoCorner: z.enum(["top-left", "top-right"]).default("top-right"),
})

// POST /api/admin/artes — multipart: upload do arquivo + create num passo so
// (evita asset orfao de fluxo em 2 requests). Molde: admin/banner/upload.
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

    const file = form.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Arquivo obrigatório" }, { status: 400 })
    }

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

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Formato não suportado (use PNG, JPG ou WEBP)" },
        { status: 400 },
      )
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Arquivo maior que 10MB" },
        { status: 400 },
      )
    }

    const buffer = await file.arrayBuffer()
    if (!isValidImageMagic(buffer, file.type)) {
      return NextResponse.json(
        { error: "Conteúdo do arquivo não corresponde ao formato declarado" },
        { status: 400 },
      )
    }

    const dimCheck = checkArtDimensions(buffer, file.type)
    if (!dimCheck.ok || !dimCheck.got) {
      return NextResponse.json(
        {
          error: dimCheck.message ?? "Dimensões inválidas",
          expected: dimCheck.expected,
          got: dimCheck.got,
        },
        { status: 400 },
      )
    }

    const path = `artes/${randomUUID()}.${extensionFor(file.type)}`

    try {
      await uploadVitrineAsset(path, buffer, file.type)
    } catch (error) {
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
          filePath: path,
          width: dimCheck.got.width,
          height: dimCheck.got.height,
          hasPrice: fields.hasPrice === "true",
          logoCorner: fields.logoCorner,
          position: (last?.position ?? -1) + 1,
        },
      })

      return NextResponse.json(
        { data: { art: { ...created, publicUrl: publicUrlFor(created.filePath) } } },
        { status: 201 },
      )
    } catch (error) {
      // Create falhou apos o upload: best-effort para nao deixar orfao no bucket.
      try {
        await deleteVitrineAsset(path)
      } catch {
        // orfao no storage nao quebra o fluxo
      }
      throw error
    }
  },
)
