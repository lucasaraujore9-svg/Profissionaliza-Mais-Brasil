import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth/guards"
import { uploadVitrineAsset } from "@/lib/supabase/storage"
import { isValidImageMagic } from "@/lib/storage/validate-image"
import { checkBannerDimensions, type BannerSlot } from "@/lib/storage/image-dims"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { withRequestContext } from "@/lib/observability/with-request-context"

const MAX_BYTES = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
])
const ALLOWED_SLOTS = new Set<BannerSlot>(["desktop", "mobile"])

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

export const POST = withRequestContext(
  { action: "admin.banner.upload", route: "/api/admin/banner/upload" },
  async (request: Request) => {
    const guard = await requireSuperAdmin()
    if (!guard.ok) return guard.response

    const rl = await rateLimit(request, RATE_LIMITS.upload)
    if (!rl.ok) return rateLimitResponse(rl)

    let form: FormData
    try {
      form = await request.formData()
    } catch {
      return NextResponse.json({ error: "Formato inválido" }, { status: 400 })
    }

    const slot = String(form.get("slot") ?? "").trim() as BannerSlot
    const file = form.get("file")

    if (!ALLOWED_SLOTS.has(slot)) {
      return NextResponse.json(
        { error: "slot deve ser 'desktop' ou 'mobile'" },
        { status: 400 },
      )
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Arquivo obrigatório" }, { status: 400 })
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Formato não suportado (use PNG, JPG ou WEBP)" },
        { status: 400 },
      )
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Arquivo maior que 5MB" },
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

    const dimCheck = checkBannerDimensions(buffer, file.type, slot)
    if (!dimCheck.ok) {
      return NextResponse.json(
        {
          error: dimCheck.message ?? "Dimensões inválidas",
          expected: dimCheck.expected,
          got: dimCheck.got,
        },
        { status: 400 },
      )
    }

    const ext = extensionFor(file.type)
    const path = `_pmb/banner-${slot}-${Date.now()}.${ext}`

    try {
      const result = await uploadVitrineAsset(path, buffer, file.type)
      return NextResponse.json({
        data: { slot, url: result.publicUrl },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro no upload"
      return NextResponse.json(
        { error: `Falha ao enviar arquivo: ${message}` },
        { status: 502 },
      )
    }
  },
)
