import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { invalidateTenant } from "@/lib/redis/tenant-cache"
import {
  deleteVitrineAsset,
  extractAssetPath,
  uploadVitrineAsset,
} from "@/lib/supabase/storage"
import { isValidImageMagic } from "@/lib/storage/validate-image"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"

const MAX_BYTES = 5 * 1024 * 1024 // 5MB
// SVGs sao bloqueados deliberadamente: podem carregar <script>/<foreignObject>
// e o asset e' servido inline pelo Supabase Storage com Content-Type=image/svg+xml.
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
])
const ALLOWED_KINDS = new Set(["logo", "banner"])

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

export async function POST(request: Request) {
  const ctx = await requireResellerSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const rl = await rateLimit(request, RATE_LIMITS.upload)
  if (!rl.ok) return rateLimitResponse(rl)

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: "Formato inválido" }, { status: 400 })
  }

  const kind = String(form.get("kind") ?? "").trim()
  const file = form.get("file")

  if (!ALLOWED_KINDS.has(kind)) {
    return NextResponse.json(
      { error: "kind deve ser 'logo' ou 'banner'" },
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

  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: {
      id: true,
      slug: true,
      customDomain: true,
      logoUrl: true,
      bannerUrl: true,
    },
  })
  if (!tenant) {
    return NextResponse.json({ error: "Tenant não encontrado" }, { status: 404 })
  }

  const ext = extensionFor(file.type)
  const path = `${tenant.id}/${kind}-${Date.now()}.${ext}`

  let uploadedUrl: string
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
    uploadedUrl = result.publicUrl
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro no upload"
    return NextResponse.json(
      { error: `Falha ao enviar arquivo: ${message}` },
      { status: 502 },
    )
  }

  const previousUrl = kind === "logo" ? tenant.logoUrl : tenant.bannerUrl
  const previousPath = extractAssetPath(previousUrl)

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: kind === "logo" ? { logoUrl: uploadedUrl } : { bannerUrl: uploadedUrl },
  })

  await invalidateTenant({
    id: tenant.id,
    slug: tenant.slug,
    customDomain: tenant.customDomain,
  })

  if (previousPath && previousPath !== path) {
    try {
      await deleteVitrineAsset(previousPath)
    } catch {
      // Falha silenciosa: arquivo antigo orfão não quebra o fluxo
    }
  }

  return NextResponse.json({
    data: {
      kind,
      url: uploadedUrl,
    },
  })
}

export async function DELETE(request: Request) {
  const ctx = await requireResellerSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const url = new URL(request.url)
  const kind = (url.searchParams.get("kind") ?? "").trim()
  if (!ALLOWED_KINDS.has(kind)) {
    return NextResponse.json(
      { error: "kind deve ser 'logo' ou 'banner'" },
      { status: 400 },
    )
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: {
      id: true,
      slug: true,
      customDomain: true,
      logoUrl: true,
      bannerUrl: true,
    },
  })
  if (!tenant) {
    return NextResponse.json({ error: "Tenant não encontrado" }, { status: 404 })
  }

  const currentUrl = kind === "logo" ? tenant.logoUrl : tenant.bannerUrl
  const currentPath = extractAssetPath(currentUrl)

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: kind === "logo" ? { logoUrl: null } : { bannerUrl: null },
  })

  await invalidateTenant({
    id: tenant.id,
    slug: tenant.slug,
    customDomain: tenant.customDomain,
  })

  if (currentPath) {
    try {
      await deleteVitrineAsset(currentPath)
    } catch {
      // Arquivo já não existe — ignora
    }
  }

  return NextResponse.json({ data: { kind, url: null } })
}
