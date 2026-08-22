import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { ensureUniquePackageSlug } from "@/lib/packages/slug"
import { requireAdmin } from "@/lib/auth/admin-guard"

/* ------------------------------------------------------------------ */
/* GET — lista os pacotes da PMB (tenant_id = null)                    */
/* ------------------------------------------------------------------ */
export const GET = withRequestContext(
  { action: "admin.pacotes.list", route: "/api/admin/pacotes" },
  async () => {
    const guard = await requireAdmin("pacotes.view")
    if (!guard.ok) return guard.response

    const packages = await prisma.coursePackage.findMany({
      where: { tenantId: null },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      include: {
        items: {
          orderBy: { order: "asc" },
          include: { course: { select: { id: true, nome: true } } },
        },
      },
    })

    return NextResponse.json({
      data: packages.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        coverImageUrl: p.coverImageUrl,
        price: Number(p.price),
        featured: p.featured,
        enabled: p.enabled,
        position: p.position,
        courseCount: p.items.length,
        courseNames: p.items.map((i) => i.course.nome),
        courseIds: p.items.map((i) => i.course.id),
      })),
    })
  },
)

/* ------------------------------------------------------------------ */
/* POST — cria um pacote da PMB                                         */
/* ------------------------------------------------------------------ */
const createSchema = z.object({
  name: z.string().trim().min(3, "Nome muito curto").max(160),
  description: z.string().trim().max(2000).nullable().optional(),
  coverImageUrl: z.string().trim().max(1000).nullable().optional(),
  price: z.number().positive("Preço deve ser maior que zero"),
  courseIds: z.array(z.string().min(1)).min(1, "Selecione ao menos 1 curso"),
  featured: z.boolean().optional(),
  enabled: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
})

export const POST = withRequestContext(
  { action: "admin.pacotes.create", route: "/api/admin/pacotes" },
  async (request: Request) => {
    const guard = await requireAdmin("pacotes.manage")
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
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const data = parsed.data

    // Dedup preservando ordem.
    const courseIds = Array.from(new Set(data.courseIds))
    const existing = await prisma.course.findMany({
      where: { id: { in: courseIds } },
      select: { id: true, nome: true, authorTenantId: true },
    })
    const existingIds = new Set(existing.map((c) => c.id))
    const missing = courseIds.filter((id) => !existingIds.has(id))
    if (missing.length > 0) {
      return NextResponse.json(
        { error: "Um ou mais cursos não foram encontrados." },
        { status: 404 },
      )
    }

    // Curso produzido por uma UNIDADE não entra em pacote da PMB. Um pacote da
    // PMB é auto-distribuído para toda a rede: o curso da unidade seria vendido
    // em todas as vitrines sob o preço do pacote, sem rateio nenhum — o
    // produtor entregaria o conteúdo dele de graça. Mesma trava do checkout,
    // onde curso de autoria vende sozinho.
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

    const slug = await ensureUniquePackageSlug(null, data.name)

    const created = await prisma.coursePackage.create({
      data: {
        tenantId: null,
        name: data.name,
        slug,
        description: data.description ?? null,
        coverImageUrl: data.coverImageUrl ?? null,
        price: data.price,
        featured: data.featured ?? false,
        enabled: data.enabled ?? true,
        position: data.position ?? 0,
        createdByUserId: guard.ctx.userId,
        createdByRole: guard.ctx.role,
        items: {
          create: courseIds.map((courseId, i) => ({ courseId, order: i })),
        },
      },
      select: { id: true, slug: true },
    })

    return NextResponse.json({ data: created }, { status: 201 })
  },
)
