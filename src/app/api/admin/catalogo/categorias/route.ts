import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/auth/guards"
import { slugifyCategoria } from "@/lib/catalog/home"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"

const createSchema = z.object({
  name: z.string().trim().min(2, "Nome muito curto").max(80),
  slug: z.string().trim().toLowerCase().min(2).max(60).optional(),
  displayOrder: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
  description: z.string().trim().max(500).optional().nullable(),
})

export const GET = withRequestContext(
  { action: "admin.catalogo.categorias.list", route: "/api/admin/catalogo/categorias" },
  async () => {
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
      _count: { select: { courseLinks: true } },
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
      courseCount: c._count.courseLinks,
    })),
  })
  },
)

export const POST = withRequestContext(
  { action: "admin.catalogo.categorias.create", route: "/api/admin/catalogo/categorias" },
  async (request: Request) => {
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

  // Fan-out: cria uma seção "Cursos de {categoria}" DESATIVADA para o
  // universo PMB (tenantId=null) e para todos os tenants. O revendedor abre
  // a vitrine e já encontra a sanfona pronta — só precisa ativar.
  // Falha aqui é não-bloqueante (categoria criada > seções nascem erradas).
  try {
    const config = {
      kind: "category_courses" as const,
      title: "",
      subtitle: "",
      categoryId: category.id,
      mode: "manual" as const,
      count: 4 as const,
      courseIds: [] as string[],
      showSeeMore: true,
    }
    await prisma.$transaction(async (tx) => {
      const tenants = await tx.tenant.findMany({ select: { id: true } })
      const scopes: (string | null)[] = [null, ...tenants.map((t) => t.id)]
      for (const tenantId of scopes) {
        const last = await tx.homeSection.findFirst({
          where: { tenantId },
          orderBy: { position: "desc" },
          select: { position: true },
        })
        await tx.homeSection.create({
          data: {
            tenantId,
            kind: "category_courses",
            position: (last?.position ?? -1) + 1,
            enabled: false,
            config,
          },
        })
      }
    })
  } catch (err) {
    contextLogger().warn(
      { err: String(err), event: "categorias.create.auto_home_section_failed", categoryId: category.id },
      "auto-criação de HomeSections falhou — categoria criada normalmente",
    )
  }

  return NextResponse.json({ data: category }, { status: 201 })
  },
)
