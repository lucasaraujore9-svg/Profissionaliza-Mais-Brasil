import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/auth/guards"
import {
  deleteVitrineAsset,
  extractAssetPath,
  uploadVitrineAsset,
} from "@/lib/supabase/storage"
import { isValidImageMagic } from "@/lib/storage/validate-image"
import { withRequestContext } from "@/lib/observability/with-request-context"

const MAX_BYTES = 5 * 1024 * 1024
// SVG bloqueado: XSS persistente via <script> embarcado seria servido inline.
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
])
const ALLOWED_KINDS = new Set(["background", "logo", "seal", "signature"])

type Kind = "background" | "logo" | "seal" | "signature"

const KIND_TO_FIELD: Record<
  Kind,
  "backgroundUrl" | "logoUrl" | "sealUrl" | "signatureUrl"
> = {
  background: "backgroundUrl",
  logo: "logoUrl",
  seal: "sealUrl",
  signature: "signatureUrl",
}

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
  { action: "admin.certificate_template.upload", route: "/api/admin/certificate-template/upload" },
  async (request: Request) => {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: "Formato inválido" }, { status: 400 })
  }

  const kind = String(form.get("kind") ?? "").trim() as Kind
  const file = form.get("file")
  if (!ALLOWED_KINDS.has(kind)) {
    return NextResponse.json({ error: "kind inválido" }, { status: 400 })
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Arquivo obrigatório" }, { status: 400 })
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Formato não suportado (PNG, JPG, WEBP)" },
      { status: 400 },
    )
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Arquivo maior que 5MB" }, { status: 400 })
  }

  const ext = extensionFor(file.type)
  const path = `certificates/__pmb__/${kind}-${Date.now()}.${ext}`

  const existing = await prisma.certificateTemplate.findFirst({
    where: { tenantId: null },
    select: { id: true, backgroundUrl: true, logoUrl: true, sealUrl: true, signatureUrl: true },
  })

  let uploadedUrl: string
  try {
    const buffer = await file.arrayBuffer()
    // Defesa contra MIME spoofing: confirma que o conteúdo bate com o
    // formato declarado. Sem isso um atacante poderia subir HTML/SVG
    // renderizado pelo Supabase com Content-Type confiável.
    if (!isValidImageMagic(buffer, file.type)) {
      return NextResponse.json(
        { error: "Conteúdo do arquivo não corresponde ao formato declarado" },
        { status: 400 },
      )
    }
    const result = await uploadVitrineAsset(path, buffer, file.type)
    uploadedUrl = result.publicUrl
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro no upload"
    return NextResponse.json({ error: `Falha no upload: ${message}` }, { status: 502 })
  }

  const field = KIND_TO_FIELD[kind]
  const previousUrl = existing ? (existing[field] as string | null) : null

  if (existing) {
    await prisma.certificateTemplate.update({
      where: { id: existing.id },
      data: { [field]: uploadedUrl },
    })
  } else {
    await prisma.certificateTemplate.create({
      data: {
        tenantId: null,
        [field]: uploadedUrl,
      },
    })
  }

  if (previousUrl && previousUrl !== uploadedUrl) {
    const previousPath = extractAssetPath(previousUrl)
    if (previousPath) {
      try {
        await deleteVitrineAsset(previousPath)
      } catch {
        // ignora
      }
    }
  }

  return NextResponse.json({ data: { kind, url: uploadedUrl } })
  },
)

export const DELETE = withRequestContext(
  { action: "admin.certificate_template.upload.delete", route: "/api/admin/certificate-template/upload" },
  async (request: Request) => {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response

  const url = new URL(request.url)
  const kind = (url.searchParams.get("kind") ?? "").trim() as Kind
  if (!ALLOWED_KINDS.has(kind)) {
    return NextResponse.json({ error: "kind inválido" }, { status: 400 })
  }

  const template = await prisma.certificateTemplate.findFirst({
    where: { tenantId: null },
  })
  if (!template) {
    return NextResponse.json({ data: { kind, url: null } })
  }

  const field = KIND_TO_FIELD[kind]
  const currentUrl = template[field] as string | null
  const currentPath = extractAssetPath(currentUrl)

  await prisma.certificateTemplate.update({
    where: { id: template.id },
    data: { [field]: null },
  })

  if (currentPath) {
    try {
      await deleteVitrineAsset(currentPath)
    } catch {
      // ignora
    }
  }

  return NextResponse.json({ data: { kind, url: null } })
  },
)
