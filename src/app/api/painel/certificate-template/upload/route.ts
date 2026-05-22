import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { requireResellerOwner } from "@/lib/auth/guards"
import {
  deleteVitrineAsset,
  extractAssetPath,
  uploadVitrineAsset,
} from "@/lib/supabase/storage"

const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
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
    case "image/svg+xml":
      return "svg"
    default:
      return "bin"
  }
}

export async function POST(request: Request) {
  const ctx = await requireResellerSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }
  const guard = await requireResellerOwner(ctx.tenantId)
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
      { error: "Formato não suportado (PNG, JPG, WEBP, SVG)" },
      { status: 400 },
    )
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Arquivo maior que 5MB" }, { status: 400 })
  }

  const ext = extensionFor(file.type)
  const path = `certificates/${ctx.tenantId}/${kind}-${Date.now()}.${ext}`

  const existing = await prisma.certificateTemplate.findUnique({
    where: { tenantId: ctx.tenantId },
    select: { id: true, backgroundUrl: true, logoUrl: true, sealUrl: true, signatureUrl: true },
  })

  let uploadedUrl: string
  try {
    const buffer = await file.arrayBuffer()
    const result = await uploadVitrineAsset(path, buffer, file.type)
    uploadedUrl = result.publicUrl
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro no upload"
    return NextResponse.json({ error: `Falha no upload: ${message}` }, { status: 502 })
  }

  const field = KIND_TO_FIELD[kind]
  const previousUrl = existing
    ? (existing[field] as string | null)
    : null

  if (existing) {
    await prisma.certificateTemplate.update({
      where: { id: existing.id },
      data: { [field]: uploadedUrl },
    })
  } else {
    await prisma.certificateTemplate.create({
      data: {
        tenantId: ctx.tenantId,
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
        // Ignora falha em órfão
      }
    }
  }

  return NextResponse.json({ data: { kind, url: uploadedUrl } })
}

export async function DELETE(request: Request) {
  const ctx = await requireResellerSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }
  const guard = await requireResellerOwner(ctx.tenantId)
  if (!guard.ok) return guard.response

  const url = new URL(request.url)
  const kind = (url.searchParams.get("kind") ?? "").trim() as Kind
  if (!ALLOWED_KINDS.has(kind)) {
    return NextResponse.json({ error: "kind inválido" }, { status: 400 })
  }

  const template = await prisma.certificateTemplate.findUnique({
    where: { tenantId: ctx.tenantId },
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
}
