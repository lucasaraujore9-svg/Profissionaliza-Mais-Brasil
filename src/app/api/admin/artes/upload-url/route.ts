import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { z } from "zod"
import { createSignedUploadUrl } from "@/lib/supabase/storage"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { ART_ALLOWED_TYPES, ART_MAX_BYTES, artExtensionFor } from "@/lib/artes/admin-upload"
import { requireAdmin } from "@/lib/auth/admin-guard"

const bodySchema = z.object({
  kind: z.enum(["feed", "story"]),
  contentType: z.string().min(1),
  size: z.number().int().positive(),
})

// POST /api/admin/artes/upload-url — assina um upload DIRETO ao Supabase
// Storage. O corpo das functions da Vercel e limitado a 4.5MB
// (FUNCTION_PAYLOAD_TOO_LARGE), entao o arquivo nunca passa pelo server: o
// browser faz PUT na URL assinada e depois registra o path via POST
// /api/admin/artes (que valida o objeto gravado antes de criar a linha).
export const POST = withRequestContext(
  { action: "admin.artes.upload-url", route: "/api/admin/artes/upload-url" },
  async (request: Request) => {
    const guard = await requireAdmin("artes.manage")
    if (!guard.ok) return guard.response

    const rl = await rateLimit(request, RATE_LIMITS.artesUpload)
    if (!rl.ok) return rateLimitResponse(rl)

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
    const { kind, contentType, size } = parsed.data

    if (!ART_ALLOWED_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: "Formato não suportado (use PNG, JPG ou WEBP)" },
        { status: 400 },
      )
    }
    if (size > ART_MAX_BYTES) {
      return NextResponse.json({ error: "Arquivo maior que 10MB" }, { status: 400 })
    }

    const suffix = kind === "story" ? "-story" : ""
    const path = `artes/${randomUUID()}${suffix}.${artExtensionFor(contentType)}`

    try {
      const uploadUrl = await createSignedUploadUrl(path)
      return NextResponse.json({ data: { path, uploadUrl } })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao assinar upload"
      return NextResponse.json(
        { error: `Falha ao preparar upload: ${message}` },
        { status: 502 },
      )
    }
  },
)
