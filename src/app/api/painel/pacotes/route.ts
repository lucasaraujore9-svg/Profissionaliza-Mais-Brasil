import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { ensureUniquePackageSlug } from "@/lib/packages/slug"

export const GET = withRequestContext(
  { action: "painel.pacotes.list", route: "/api/painel/pacotes" },
  async () => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const [pmb, own, overrides] = await Promise.all([
      prisma.coursePackage.findMany({
        where: { tenantId: null, enabled: true },
        orderBy: [{ position: "asc" }, { createdAt: "desc" }],
        include: {
          items: {
            orderBy: { order: "asc" },
            include: { course: { select: { nome: true } } },
          },
        },
      }),
      prisma.coursePackage.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: [{ position: "asc" }, { createdAt: "desc" }],
        include: {
          items: {
            orderBy: { order: "asc" },
            include: { course: { select: { nome: true } } },
          },
        },
      }),
      prisma.tenantPackage.findMany({ where: { tenantId: ctx.tenantId } }),
    ])

    const overrideByPkg = new Map(overrides.map((o) => [o.packageId, o]))

    return NextResponse.json({
      data: {
        pmbPackages: pmb.map((p) => {
          const o = overrideByPkg.get(p.id)
          return {
            id: p.id,
            name: p.name,
            slug: p.slug,
            description: p.description,
            coverImageUrl: o?.customCoverUrl ?? p.coverImageUrl,
            basePrice: Number(p.price),
            effectivePrice: o?.price != null ? Number(o.price) : Number(p.price),
            hasCustomPrice: o?.price != null,
            isVisible: o?.isVisible ?? true,
            isFeatured: o?.isFeatured ?? p.featured,
            courseCount: p.items.length,
            courseNames: p.items.map((i) => i.course.nome),
          }
        }),
        ownPackages: own.map((p) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          description: p.description,
          coverImageUrl: p.coverImageUrl,
          price: Number(p.price),
          enabled: p.enabled,
          featured: p.featured,
          courseCount: p.items.length,
          courseNames: p.items.map((i) => i.course.nome),
        })),
      },
    })
  },
)

const createSchema = z.object({
  name: z.string().trim().min(3).max(160),
  description: z.string().trim().max(2000).nullable().optional(),
  coverImageUrl: z.string().url().nullable().optional(),
  price: z.number().positive("Preço deve ser maior que zero"),
  courseIds: z.array(z.string().min(1)).min(1, "Selecione ao menos 1 curso"),
  featured: z.boolean().optional(),
})

export const POST = withRequestContext(
  { action: "painel.pacotes.create", route: "/api/painel/pacotes" },
  async (request: Request) => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const parsed = createSchema.safeParse(payload)
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

    const slug = await ensureUniquePackageSlug(ctx.tenantId, data.name)

    const created = await prisma.coursePackage.create({
      data: {
        tenantId: ctx.tenantId,
        name: data.name,
        slug,
        description: data.description ?? null,
        coverImageUrl: data.coverImageUrl ?? null,
        price: data.price,
        featured: data.featured ?? false,
        enabled: true,
        createdByUserId: ctx.userId,
        createdByRole: "RESELLER",
        items: {
          create: courseIds.map((courseId, index) => ({ courseId, order: index })),
        },
      },
      select: { id: true, slug: true },
    })

    return NextResponse.json({ data: { id: created.id, slug: created.slug } })
  },
)
