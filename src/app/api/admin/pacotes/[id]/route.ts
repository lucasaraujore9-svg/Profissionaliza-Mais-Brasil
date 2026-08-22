import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { ensureUniquePackageSlug } from "@/lib/packages/slug"
import { requireAdmin } from "@/lib/auth/admin-guard"

/* GET — um pacote da PMB com seus cursos (ordenados) */
export const GET = withRequestContextParams<{ id: string }>(
  { action: "admin.pacotes.get", route: "/api/admin/pacotes/[id]" },
  async (_request: Request, ctx) => {
    const guard = await requireAdmin("pacotes.view")
    if (!guard.ok) return guard.response

    const { id } = await ctx.params
    const pkg = await prisma.coursePackage.findFirst({
      where: { id, tenantId: null },
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
        featured: pkg.featured,
        enabled: pkg.enabled,
        position: pkg.position,
        courseIds: pkg.items.map((i) => i.course.id),
        courseNames: pkg.items.map((i) => i.course.nome),
      },
    })
  },
)

/* PUT — atualiza um pacote da PMB (substitui os cursos quando enviados) */
const updateSchema = z.object({
  name: z.string().trim().min(3).max(160).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  coverImageUrl: z.string().trim().max(1000).nullable().optional(),
  price: z.number().positive().optional(),
  courseIds: z.array(z.string().min(1)).min(1).optional(),
  featured: z.boolean().optional(),
  enabled: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
})

export const PUT = withRequestContextParams<{ id: string }>(
  { action: "admin.pacotes.update", route: "/api/admin/pacotes/[id]" },
  async (request: Request, ctx) => {
    const guard = await requireAdmin("pacotes.manage")
    if (!guard.ok) return guard.response

    const { id } = await ctx.params
    const pkg = await prisma.coursePackage.findFirst({
      where: { id, tenantId: null },
      select: { id: true, name: true },
    })
    if (!pkg) {
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

    let courseIds: string[] | null = null
    if (data.courseIds) {
      courseIds = Array.from(new Set(data.courseIds))
      const existing = await prisma.course.findMany({
        where: { id: { in: courseIds } },
        select: { id: true, nome: true, authorTenantId: true },
      })
      const existingIds = new Set(existing.map((c) => c.id))
      const missing = courseIds.filter((cid) => !existingIds.has(cid))
      if (missing.length > 0) {
        return NextResponse.json(
          { error: "Um ou mais cursos não foram encontrados." },
          { status: 404 },
        )
      }

      // Mesma trava da criação: pacote da PMB é auto-distribuído para toda a
      // rede, e o curso de uma unidade seria vendido em todas as vitrines sem
      // rateio nenhum.
      const autoral = existing.find((c) => c.authorTenantId !== null)
      if (autoral) {
        return NextResponse.json(
          {
            error: `O curso "${autoral.nome}" é produzido por uma unidade e não pode entrar em um pacote da PMB.`,
            code: "AUTHORED_COURSE_ALONE",
          },
          { status: 400 },
        )
      }
    }

    // Recalcula o slug só quando o nome muda.
    const slug =
      data.name && data.name !== pkg.name
        ? await ensureUniquePackageSlug(null, data.name, id)
        : undefined

    await prisma.$transaction(async (tx) => {
      await tx.coursePackage.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(slug !== undefined && { slug }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.coverImageUrl !== undefined && { coverImageUrl: data.coverImageUrl }),
          ...(data.price !== undefined && { price: data.price }),
          ...(data.featured !== undefined && { featured: data.featured }),
          ...(data.enabled !== undefined && { enabled: data.enabled }),
          ...(data.position !== undefined && { position: data.position }),
        },
      })
      if (courseIds) {
        await tx.coursePackageItem.deleteMany({ where: { packageId: id } })
        await tx.coursePackageItem.createMany({
          data: courseIds.map((courseId, i) => ({ packageId: id, courseId, order: i })),
        })
      }
    })

    return NextResponse.json({ data: { id } })
  },
)

/* DELETE — remove um pacote da PMB (itens cascade; matrículas preservadas) */
export const DELETE = withRequestContextParams<{ id: string }>(
  { action: "admin.pacotes.delete", route: "/api/admin/pacotes/[id]" },
  async (_request: Request, ctx) => {
    const guard = await requireAdmin("pacotes.manage")
    if (!guard.ok) return guard.response

    const { id } = await ctx.params
    const pkg = await prisma.coursePackage.findFirst({
      where: { id, tenantId: null },
      select: { id: true },
    })
    if (!pkg) {
      return NextResponse.json({ error: "Pacote não encontrado" }, { status: 404 })
    }

    await prisma.coursePackage.delete({ where: { id } })
    return NextResponse.json({ data: { deleted: true } })
  },
)
