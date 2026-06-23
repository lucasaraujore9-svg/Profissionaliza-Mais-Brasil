import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/auth/guards"
import { withRequestContext } from "@/lib/observability/with-request-context"

// GET /api/admin/treinamentos/modules
// Lista todos os modulos (publicados ou nao) com seus videos, na ordem de gestao.
export const GET = withRequestContext(
  { action: "admin.treinamentos.modules.list", route: "/api/admin/treinamentos/modules" },
  async () => {
    const guard = await requireSuperAdmin()
    if (!guard.ok) return guard.response

    const modules = await prisma.trainingModule.findMany({
      orderBy: { position: "asc" },
      include: {
        videos: { orderBy: { position: "asc" } },
        _count: { select: { videos: true } },
      },
    })

    return NextResponse.json({ data: { modules } })
  },
)

const createSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional().nullable(),
  coverUrl: z.string().trim().url().max(500).optional().nullable(),
  published: z.boolean().optional(),
})

// POST /api/admin/treinamentos/modules — cria um modulo no fim da lista.
export const POST = withRequestContext(
  { action: "admin.treinamentos.modules.create", route: "/api/admin/treinamentos/modules" },
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
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const data = parsed.data

    const last = await prisma.trainingModule.findFirst({
      orderBy: { position: "desc" },
      select: { position: true },
    })

    const created = await prisma.trainingModule.create({
      data: {
        title: data.title,
        description: data.description ?? null,
        coverUrl: data.coverUrl ?? null,
        // Nasce PUBLICADO por padrão — o conteúdo de treinamento é global e
        // deve aparecer para todas as unidades assim que criado. O admin ainda
        // pode despublicar pontualmente pelo toggle de gestão.
        published: data.published ?? true,
        position: (last?.position ?? -1) + 1,
      },
      include: { videos: true, _count: { select: { videos: true } } },
    })

    return NextResponse.json({ data: { module: created } }, { status: 201 })
  },
)
