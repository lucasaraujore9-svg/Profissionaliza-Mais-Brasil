import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { ensureUniquePackageSlug } from "@/lib/packages/slug"

async function ownPackage(tenantId: string, id: string) {
  return prisma.coursePackage.findFirst({
    where: { id, tenantId },
    select: { id: true, name: true },
  })
}

export const GET = withRequestContextParams<{ id: string }>(
  { action: "painel.pacotes.get", route: "/api/painel/pacotes/[id]" },
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const guard = await requirePainel("catalogo.view")
    if (!guard.ok) return guard.response
    const { ctx } = guard
    const { id } = await params
    const pkg = await prisma.coursePackage.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        items: {
          orderBy: { order: "asc" },
          include: { course: { select: { id: true, nome: true } } },
        },
      },
    })
    if (!pkg) {
      return NextResponse.json({ error: "Pacote não encontrado" }, { status: 404 })
    }
    return NextResponse.json({
      data: {
        id: pkg.id,
        name: pkg.name,
        slug: pkg.slug,
        description: pkg.description,
        coverImageUrl: pkg.coverImageUrl,
        price: Number(pkg.price),
        enabled: pkg.enabled,
        featured: pkg.featured,
        courseIds: pkg.items.map((i) => i.course.id),
        courses: pkg.items.map((i) => ({ id: i.course.id, nome: i.course.nome })),
      },
    })
  },
)

const updateSchema = z.object({
  name: z.string().trim().min(3).max(160),
  description: z.string().trim().max(2000).nullable().optional(),
  coverImageUrl: z.string().url().nullable().optional(),
  price: z.number().positive("Preço deve ser maior que zero"),
  courseIds: z.array(z.string().min(1)).min(1, "Selecione ao menos 1 curso"),
  featured: z.boolean().optional(),
  enabled: z.boolean().optional(),
})

export const PUT = withRequestContextParams<{ id: string }>(
  { action: "painel.pacotes.update", route: "/api/painel/pacotes/[id]" },
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const guard = await requirePainel("pacotes.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard
    const { id } = await params
    const existing = await ownPackage(ctx.tenantId, id)
    if (!existing) {
      return NextResponse.json({ error: "Pacote não encontrado" }, { status: 404 })
    }

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
    const data = parsed.data

    const courseIds = Array.from(new Set(data.courseIds))
    const courses = await prisma.course.findMany({
      where: { id: { in: courseIds }, status: "ATIVO" },
      select: { id: true },
    })
    if (courses.length !== courseIds.length) {
      return NextResponse.json(
        { error: "Um ou mais cursos são inválidos ou inativos", code: "INVALID_COURSES" },
        { status: 400 },
      )
    }

    const slug =
      data.name !== existing.name
        ? await ensureUniquePackageSlug(ctx.tenantId, data.name, id)
        : undefined

    await prisma.$transaction([
      prisma.coursePackageItem.deleteMany({ where: { packageId: id } }),
      prisma.coursePackage.update({
        where: { id },
        data: {
          name: data.name,
          ...(slug ? { slug } : {}),
          description: data.description ?? null,
          coverImageUrl: data.coverImageUrl ?? null,
          price: data.price,
          ...(data.featured !== undefined ? { featured: data.featured } : {}),
          ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
          items: {
            create: courseIds.map((courseId, index) => ({ courseId, order: index })),
          },
        },
      }),
    ])

    return NextResponse.json({ data: { id } })
  },
)

export const DELETE = withRequestContextParams<{ id: string }>(
  { action: "painel.pacotes.delete", route: "/api/painel/pacotes/[id]" },
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const guard = await requirePainel("pacotes.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard
    const { id } = await params
    const existing = await ownPackage(ctx.tenantId, id)
    if (!existing) {
      return NextResponse.json({ error: "Pacote não encontrado" }, { status: 404 })
    }
    await prisma.coursePackage.delete({ where: { id } })
    return NextResponse.json({ data: { ok: true } })
  },
)
