import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/auth/guards"
import { slugifyCategoria } from "@/lib/catalog/home"

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

interface Ctx {
  params: Promise<{ id: string }>
}

export async function PATCH(request: Request, ctx: Ctx) {
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
}

export async function DELETE(_request: Request, ctx: Ctx) {
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

  return NextResponse.json({
    data: { id, courseCountReleased: current._count.courses },
  })
}
