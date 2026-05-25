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

const SETTINGS_ID = "default"
const MAX_BYTES = 2 * 1024 * 1024
// SVG bloqueado: XSS persistente via <script> embarcado seria servido inline.
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

export const POST = withRequestContext(
  { action: "admin.system_settings.group_logo.upload", route: "/api/admin/system-settings/group-logo/upload" },
  async (request: Request) => {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response

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
      { error: "Formato não suportado (PNG, JPG, WEBP)" },
      { status: 400 },
    )
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Arquivo maior que 2MB" }, { status: 400 })
  }

  const ext = extensionFor(file.type)
  const path = `system/group-logo-${Date.now()}.${ext}`

  const existing = await prisma.systemSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: { groupLogoUrl: true },
  })

  let uploadedUrl: string
  try {
    const buffer = await file.arrayBuffer()
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
    return NextResponse.json(
      { error: `Falha no upload: ${message}` },
      { status: 502 },
    )
  }

  const row = await prisma.systemSettings.upsert({
    where: { id: SETTINGS_ID },
    update: { groupLogoUrl: uploadedUrl },
    create: { id: SETTINGS_ID, groupLogoUrl: uploadedUrl },
    select: { groupLogoUrl: true, groupName: true },
  })

  const previousUrl = existing?.groupLogoUrl ?? null
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

  return NextResponse.json({ data: { url: row.groupLogoUrl } })
  },
)

export const DELETE = withRequestContext(
  { action: "admin.system_settings.group_logo.delete", route: "/api/admin/system-settings/group-logo/upload" },
  async () => {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response

  const existing = await prisma.systemSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: { groupLogoUrl: true },
  })

  const currentUrl = existing?.groupLogoUrl ?? null
  if (!currentUrl) {
    return NextResponse.json({ data: { url: null } })
  }

  await prisma.systemSettings.update({
    where: { id: SETTINGS_ID },
    data: { groupLogoUrl: null },
  })

  const currentPath = extractAssetPath(currentUrl)
  if (currentPath) {
    try {
      await deleteVitrineAsset(currentPath)
    } catch {
      // ignora
    }
  }

  return NextResponse.json({ data: { url: null } })
  },
)
