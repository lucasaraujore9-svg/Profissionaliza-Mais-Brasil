import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/auth/guards"
import { slugifyCategoria } from "@/lib/catalog/home"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"

const updateSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    slug: z.string().trim().toLowerCase().min(2).max(60).optional(),
    displayOrder: z.number().int().min(0).max(9999).optional(),
    isActive: z.boolean().optional(),
    description: z.string().trim().max(500).optional().nullable(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Forneça pelo menos um campo para atualizar",
  })

export const PATCH = withRequestContextParams<{ id: string }>(
  { action: "admin.catalogo.categorias.update", route: "/api/admin/catalogo/categorias/[id]" },
  async (request: Request, ctx) => {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response

  const { id } = await ctx.params

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const parsed = updateSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  const current = await prisma.category.findUnique({
    where: { id },
    select: { id: true, name: true, slug: true },
  })
  if (!current) {
    return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 })
  }

  const data: Record<string, unknown> = {}
  if (parsed.data.name !== undefined) data.name = parsed.data.name.trim()
  if (parsed.data.slug !== undefined) {
    data.slug = parsed.data.slug.trim()
  } else if (data.name && typeof data.name === "string" && data.name !== current.name) {
    // Se renomeou e nao passou slug explicito, regera o slug.
    data.slug = slugifyCategoria(data.name as string)
  }
  if (parsed.data.displayOrder !== undefined) data.displayOrder = parsed.data.displayOrder
  if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive
  if (parsed.data.description !== undefined) data.description = parsed.data.description

  if (typeof data.slug === "string" && !/^[a-z0-9-]+$/.test(data.slug)) {
    return NextResponse.json(
      { error: "Slug inválido", fields: { slug: ["slug inválido"] } },
      { status: 400 },
    )
  }

  if (data.name || data.slug) {
    const conflict = await prisma.category.findFirst({
      where: {
        AND: [
          { NOT: { id } },
          {
            OR: [
              data.name ? { name: data.name as string } : {},
              data.slug ? { slug: data.slug as string } : {},
            ].filter((c) => Object.keys(c).length > 0),
          },
        ],
      },
      select: { id: true, name: true, slug: true },
    })
    if (conflict) {
      return NextResponse.json(
        { error: "Já existe outra categoria com esse nome ou slug" },
        { status: 409 },
      )
    }
  }

  const updated = await prisma.category.update({
    where: { id },
    data,
  })

  return NextResponse.json({ data: updated })
  },
)

export const DELETE = withRequestContextParams<{ id: string }>(
  { action: "admin.catalogo.categorias.delete", route: "/api/admin/catalogo/categorias/[id]" },
  async (_request: Request, ctx) => {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response

  const { id } = await ctx.params

  const current = await prisma.category.findUnique({
    where: { id },
    select: { id: true, _count: { select: { courses: true } } },
  })
  if (!current) {
    return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 })
  }

  // FK ON DELETE SET NULL → cursos passam a ficar `categoryId: null`.
  await prisma.category.delete({ where: { id } })

  // Espelha a criação automática feita em POST /categorias: ao apagar a
  // categoria, removemos todas as seções "category_courses" vinculadas a ela
  // (PMB + todos os tenants). Falha aqui é não-bloqueante para não reverter o
  // delete que já aconteceu.
  try {
    await prisma.homeSection.deleteMany({
      where: {
        kind: "category_courses",
        config: { path: ["categoryId"], equals: id },
      },
    })
  } catch (err) {
    contextLogger().warn(
      { err: String(err), event: "categorias.delete.auto_home_section_failed", categoryId: id },
      "auto-remoção de HomeSections falhou — categoria removida normalmente",
    )
  }

  return NextResponse.json({
    data: { id, courseCountReleased: current._count.courses },
  })
  },
)
