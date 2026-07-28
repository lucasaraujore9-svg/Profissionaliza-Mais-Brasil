import { NextResponse } from "next/server"
import { uploadVitrineAsset } from "@/lib/supabase/storage"
import { isValidImageMagic } from "@/lib/storage/validate-image"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

const MAX_BYTES = 5 * 1024 * 1024 // 5MB
// SVGs sao bloqueados deliberadamente: podem carregar <script>/<foreignObject>
// e o asset e' servido inline pelo Supabase Storage com Content-Type=image/svg+xml.
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

// Upload das capas dos cursos da seção "Unidade Técnica". A imagem é uma config
// system-wide (definida pela PMB), por isso o guard é SUPER_ADMIN. O arquivo vai
// para o bucket `vitrine-assets` sob o prefixo `tecnica/` e a URL pública servida
// de `*.supabase.co` — domínio já liberado no CSP (next.config.ts). Resolve o
// caso em que colar uma URL de S3 quebrava a imagem por bloqueio de CSP.
export const POST = withRequestContext(
  {
    action: "admin.system_settings.tecnica.upload",
    route: "/api/admin/system-settings/tecnica/upload",
  },
  async (request: Request) => {
    const guard = await requireAdmin("vitrine.manage")
    if (!guard.ok) return guard.response

    const rl = await rateLimit(request, RATE_LIMITS.upload)
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

    const ext = extensionFor(file.type)
    const path = `tecnica/${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`

    try {
      const buffer = await file.arrayBuffer()
      // Magic byte check — mime declarado pelo client é spoofable; valida o conteúdo real.
      if (!isValidImageMagic(buffer, file.type)) {
        return NextResponse.json(
          { error: "Conteúdo do arquivo não corresponde ao formato declarado" },
          { status: 400 },
        )
      }
      const result = await uploadVitrineAsset(path, buffer, file.type)
      return NextResponse.json({ data: { url: result.publicUrl } })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro no upload"
      return NextResponse.json(
        { error: `Falha ao enviar arquivo: ${message}` },
        { status: 502 },
      )
    }
  },
)
