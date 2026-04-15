import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireResellerOwner } from "@/lib/auth/guards"
import { auth } from "@/lib/auth"

async function currentTenantId(): Promise<string | null> {
  const session = await auth()
  const user = session?.user as { tenantId?: string | null } | undefined
  return user?.tenantId ?? null
}

const patchSchema = z.object({
  maxDiscount: z.number().int().min(0).max(100).nullable().optional(),
  status: z.enum(["ATIVO", "INATIVO"]).optional(),
})

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const tenantId = await currentTenantId()
  if (!tenantId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const guard = await requireResellerOwner(tenantId)
  if (!guard.ok) return guard.response
  const { id } = await ctx.params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
  }

  const member = await prisma.tenantMember.findUnique({ where: { id } })
  if (!member || member.tenantId !== tenantId) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
  }

  const updated = await prisma.tenantMember.update({
    where: { id },
    data: parsed.data,
  })

  return NextResponse.json({ data: updated })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const tenantId = await currentTenantId()
  if (!tenantId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const guard = await requireResellerOwner(tenantId)
  if (!guard.ok) return guard.response
  const { id } = await ctx.params

  const member = await prisma.tenantMember.findUnique({ where: { id } })
  if (!member || member.tenantId !== tenantId) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
  }

  await prisma.tenantMember.update({ where: { id }, data: { status: "INATIVO" } })
  return NextResponse.json({ data: { id, status: "INATIVO" } })
}
