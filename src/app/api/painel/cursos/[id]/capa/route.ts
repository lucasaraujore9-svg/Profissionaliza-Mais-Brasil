import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import {
  deleteVitrineAsset,
  extractAssetPath,
  uploadVitrineAsset,
} from "@/lib/supabase/storage"

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

async function loadOwnedCourse(tenantId: string, id: string) {
  return prisma.tenantCourse.findFirst({
    where: { id, tenantId },
    select: { id: true, customCapaUrl: true },
  })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireResellerSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const { id } = await params
  const tc = await loadOwnedCourse(ctx.tenantId, id)
  if (!tc) {
    return NextResponse.json({ error: "Curso não encontrado" }, { status: 404 })
  }

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

  const ext = extensionFor(file.type)
  const path = `${ctx.tenantId}/courses/${id}-${Date.now()}.${ext}`

  let uploadedUrl: string
  try {
    const buffer = await file.arrayBuffer()
    const result = await uploadVitrineAsset(path, buffer, file.type)
    uploadedUrl = result.publicUrl
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro no upload"
    return NextResponse.json(
      { error: `Falha ao enviar arquivo: ${message}` },
      { status: 502 },
    )
  }

  const previousPath = extractAssetPath(tc.customCapaUrl)

  await prisma.tenantCourse.update({
    where: { id: tc.id },
    data: { customCapaUrl: uploadedUrl },
  })

  if (previousPath && previousPath !== path) {
    try {
      await deleteVitrineAsset(previousPath)
    } catch {
      // ignora
    }
  }

  return NextResponse.json({ data: { url: uploadedUrl } })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireResellerSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const { id } = await params
  const tc = await loadOwnedCourse(ctx.tenantId, id)
  if (!tc) {
    return NextResponse.json({ error: "Curso não encontrado" }, { status: 404 })
  }

  const previousPath = extractAssetPath(tc.customCapaUrl)

  await prisma.tenantCourse.update({
    where: { id: tc.id },
    data: { customCapaUrl: null },
  })

  if (previousPath) {
    try {
      await deleteVitrineAsset(previousPath)
    } catch {
      // ignora
    }
  }

  return NextResponse.json({ data: { url: null } })
}
