import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePmbTeam } from "@/lib/auth/guards"

async function assertCanAccess(tenantId: string, session: { userId: string; role: string }) {
  if (session.role === "SUPER_ADMIN") return true
  if (session.role !== "PMB_RESELLER_MGR") return false
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { accountManagerId: true },
  })
  return t?.accountManagerId === session.userId
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePmbTeam()
  if (!guard.ok) return guard.response
  const { id } = await ctx.params

  if (!(await assertCanAccess(id, guard.session))) {
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
}

const createSchema = z.object({ body: z.string().min(1).max(4000) })

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePmbTeam()
  if (!guard.ok) return guard.response
  const { id } = await ctx.params

  if (!(await assertCanAccess(id, guard.session))) {
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
      authorId: guard.session.userId,
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
}
