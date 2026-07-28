import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { requireAdmin, type AdminContext } from "@/lib/auth/admin-guard"

/** Recorte da carteira, no formato do papel de quem chamou. */
async function assertCanAccess(tenantId: string, ctx: AdminContext) {
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { accountManagerId: true, salesUserId: true },
  })
  return ctx.canAccessTenant(t)
}

export const GET = withRequestContextParams<{ id: string }>(
  { action: "admin.revendedores.notes.list", route: "/api/admin/revendedores/[id]/notes" },
  async (_req: Request, ctx) => {
  const guard = await requireAdmin("unidades.view")
  if (!guard.ok) return guard.response
  const { id } = await ctx.params

  if (!(await assertCanAccess(id, guard.ctx))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const notes = await prisma.tenantSupportNote.findMany({
    where: { tenantId: id },
    orderBy: { createdAt: "desc" },
    include: { author: { select: { name: true } } },
  })

  return NextResponse.json({
    data: notes.map((n) => ({
      id: n.id,
      body: n.body,
      author: n.author.name,
      createdAt: n.createdAt.toISOString(),
    })),
  })
  },
)

const createSchema = z.object({ body: z.string().min(1).max(4000) })

export const POST = withRequestContextParams<{ id: string }>(
  { action: "admin.revendedores.notes.create", route: "/api/admin/revendedores/[id]/notes" },
  async (req: Request, ctx) => {
  const guard = await requireAdmin("unidades.manage")
  if (!guard.ok) return guard.response
  const { id } = await ctx.params

  if (!(await assertCanAccess(id, guard.ctx))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
  }

  const note = await prisma.tenantSupportNote.create({
    data: {
      tenantId: id,
      authorId: guard.ctx.userId,
      body: parsed.data.body,
    },
    include: { author: { select: { name: true } } },
  })

  return NextResponse.json({
    data: {
      id: note.id,
      body: note.body,
      author: note.author.name,
      createdAt: note.createdAt.toISOString(),
    },
  })
  },
)
