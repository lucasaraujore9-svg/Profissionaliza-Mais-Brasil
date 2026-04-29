import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { requireSuperAdmin } from "@/lib/auth/guards"

const patchSchema = z.object({
  precoVitrineMain: z.number().nonnegative().nullable().optional(),
  destaqueHome: z.boolean().optional(),
  ordemHome: z.number().int().nullable().optional(),
  descricaoOverride: z.string().nullable().optional(),
  capaOverride: z.string().url().nullable().optional(),
  parcelasOverride: z.number().int().min(1).max(24).nullable().optional(),
  categoriaLoja: z.string().nullable().optional(),
  status: z.enum(["ATIVO", "INATIVO"]).optional(),
  hiddenMain: z.boolean().optional(),
})

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdminSession()
  if (!ctx) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

  const { id } = await params
  const course = await prisma.course.findUnique({
    where: { id },
    select: {
      id: true,
      nome: true,
      slug: true,
      descricao: true,
      qtdAulas: true,
      cargaHoraria: true,
      precoOriginal: true,
      precoPromocional: true,
      categoriaLoja: true,
      status: true,
      capaImageUrl: true,
      precoVitrineMain: true,
      destaqueHome: true,
      ordemHome: true,
      descricaoOverride: true,
      capaOverride: true,
      parcelasSugeridas: true,
      parcelasOverride: true,
      hiddenMain: true,
    },
  })
  if (!course) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })

  return NextResponse.json({
    data: {
      ...course,
      precoOriginal: course.precoOriginal ? Number(course.precoOriginal) : null,
      precoPromocional: course.precoPromocional ? Number(course.precoPromocional) : null,
      precoVitrineMain: course.precoVitrineMain ? Number(course.precoVitrineMain) : null,
    },
  })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response

  const { id } = await params
  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido", issues: parsed.error.issues }, { status: 400 })
  }

  const updated = await prisma.course.update({
    where: { id },
    data: parsed.data,
    select: {
      id: true,
      precoVitrineMain: true,
      destaqueHome: true,
      ordemHome: true,
      descricaoOverride: true,
      capaOverride: true,
      parcelasOverride: true,
      categoriaLoja: true,
      status: true,
      hiddenMain: true,
    },
  })

  return NextResponse.json({
    data: {
      ...updated,
      precoVitrineMain: updated.precoVitrineMain ? Number(updated.precoVitrineMain) : null,
    },
  })
}
