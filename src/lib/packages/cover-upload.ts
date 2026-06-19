import { NextResponse } from "next/server"
import {
  deleteVitrineAsset,
  extractAssetPath,
  uploadVitrineAsset,
} from "@/lib/supabase/storage"
import { isValidImageMagic } from "@/lib/storage/validate-image"

const MAX_BYTES = 5 * 1024 * 1024 // 5MB
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

/**
 * Recebe um multipart com `file` (capa do pacote), valida tipo/tamanho/magic
 * bytes, sobe pro bucket `vitrine-assets` e devolve `{ data: { url } }`.
 *
 * Standalone (nao depende de um pacote ja existir) — o upload acontece durante
 * a CRIACAO do pacote e a URL volta pro form, que a salva no `coverImageUrl` no
 * submit. Mesma rota serve a edicao.
 *
 * `opts.pathPrefix` isola os assets por contexto (ex.: `packages/pmb` para a
 * PMB, `{tenantId}/packages` para a revenda). `opts.allowedDeletePrefix` limita
 * quais assets o chamador pode apagar ao trocar a capa — defesa contra apagar
 * arquivo de outro tenant via `previousUrl` forjado.
 */
export async function handlePackageCoverUpload(
  request: Request,
  opts: { pathPrefix: string; allowedDeletePrefix: string },
): Promise<NextResponse> {
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
    return NextResponse.json({ error: "Arquivo maior que 5MB" }, { status: 400 })
  }

  const buffer = await file.arrayBuffer()
  if (!isValidImageMagic(buffer, file.type)) {
    return NextResponse.json(
      { error: "Conteúdo do arquivo não corresponde ao formato declarado" },
      { status: 400 },
    )
  }

  const path = `${opts.pathPrefix}/${crypto.randomUUID()}.${extensionFor(file.type)}`

  let uploadedUrl: string
  try {
    const result = await uploadVitrineAsset(path, buffer, file.type)
    uploadedUrl = result.publicUrl
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro no upload"
    return NextResponse.json(
      { error: `Falha ao enviar arquivo: ${message}` },
      { status: 502 },
    )
  }

  // Best-effort: remove a capa anterior quando o usuario troca a capa na mesma
  // sessao. So apaga assets sob o prefixo permitido do chamador.
  const previousUrl = form.get("previousUrl")
  if (typeof previousUrl === "string" && previousUrl) {
    const previousPath = extractAssetPath(previousUrl)
    if (
      previousPath &&
      previousPath !== path &&
      previousPath.startsWith(opts.allowedDeletePrefix)
    ) {
      try {
        await deleteVitrineAsset(previousPath)
      } catch {
        // ignora — limpeza nao deve bloquear o upload bem-sucedido
      }
    }
  }

  return NextResponse.json({ data: { url: uploadedUrl } })
}
