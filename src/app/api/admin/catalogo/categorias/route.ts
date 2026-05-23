import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/auth/guards"
import { slugifyCategoria } from "@/lib/catalog/home"

const createSchema = z.object({
  name: z.string().trim().min(2, "Nome muito curto").max(80),
  slug: z.string().trim().toLowerCase().min(2).max(60).optional(),
  displayOrder: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
  description: z.string().trim().max(500).optional().nullable(),
})

export async function GET() {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response

  const categories = await prisma.category.findMany({
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      displayOrder: true,
      isActive: true,
      description: true,
      _count: { select: { courses: true } },
    },
  })

  return NextResponse.json({
    data: categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      displayOrder: c.displayOrder,
      isActive: c.isActive,
      description: c.description,
      courseCount: c._count.courses,
    })),
  })
}

export async function POST(request: Request) {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const parsed = createSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Dados inválidos",
        fields: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    )
  }

  const name = parsed.data.name.trim()
  const slug = (parsed.data.slug ?? slugifyCategoria(name)).trim()

  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json(
      { error: "Slug inválido (use apenas letras minúsculas, números e hífens)", fields: { slug: ["slug inválido"] } },
      { status: 400 },
    )
  }

  const conflict = await prisma.category.findFirst({
    where: { OR: [{ name }, { slug }] },
    select: { id: true, name: true, slug: true },
  })
  if (conflict) {
    return NextResponse.json(
      { error: `Já existe uma categoria com esse ${conflict.name === name ? "nome" : "slug"}` },
      { status: 409 },
    )
  }

  const category = await prisma.category.create({
    data: {
      name,
      slug,
      displayOrder: parsed.data.displayOrder ?? 0,
      isActive: parsed.data.isActive ?? true,
      description: parsed.data.description ?? null,
    },
  })

  return NextResponse.json({ data: category }, { status: 201 })
}
