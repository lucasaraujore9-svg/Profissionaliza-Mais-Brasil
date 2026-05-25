import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/auth/guards"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

const PMB_ROLES = ["SUPER_ADMIN", "PMB_SALES", "PMB_RESELLER_MGR"] as const

export const GET = withRequestContextParams<{ id: string }>(
  { action: "admin.equipe.get", route: "/api/admin/equipe/[id]" },
  async (_req: Request, ctx) => {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response
  const { id } = await ctx.params

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      phone: true,
      image: true,
      lastActiveAt: true,
      passwordHash: true,
      createdAt: true,
    },
  })

  if (!user || !(PMB_ROLES as readonly string[]).includes(user.role)) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
  }

  return NextResponse.json({
    data: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      phone: user.phone,
      image: user.image,
      lastActiveAt: user.lastActiveAt?.toISOString() ?? null,
      pendingInvite: !user.passwordHash,
      createdAt: user.createdAt.toISOString(),
    },
  })
  },
)

const patchSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  role: z.enum(PMB_ROLES).optional(),
  status: z.enum(["ATIVO", "INATIVO"]).optional(),
  phone: z.string().nullable().optional(),
  image: z.string().url().nullable().optional(),
})

export const PATCH = withRequestContextParams<{ id: string }>(
  { action: "admin.equipe.update", route: "/api/admin/equipe/[id]" },
  async (req: Request, ctx) => {
  const guard = await requireSuperAdmin()
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
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } })
  if (!target || !(PMB_ROLES as readonly string[]).includes(target.role)) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
  }

  // Previne o último SUPER_ADMIN de ser rebaixado
  if ((parsed.data.role && parsed.data.role !== "SUPER_ADMIN") || parsed.data.status === "INATIVO") {
    if (target.role === "SUPER_ADMIN") {
      const activeSupers = await prisma.user.count({
        where: { role: "SUPER_ADMIN", status: "ATIVO", NOT: { id } },
      })
      if (activeSupers === 0) {
        return NextResponse.json(
          { error: "É necessário ao menos um Super Admin ativo" },
          { status: 409 },
        )
      }
    }
  }

  const updated = await prisma.user.update({
    where: { id },
    data: parsed.data,
    select: { id: true, name: true, email: true, role: true, status: true },
  })

  return NextResponse.json({ data: updated })
  },
)

export const DELETE = withRequestContextParams<{ id: string }>(
  { action: "admin.equipe.delete", route: "/api/admin/equipe/[id]" },
  async (_req: Request, ctx) => {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response
  const { id } = await ctx.params

  if (id === guard.session.userId) {
    return NextResponse.json({ error: "Você não pode se desativar" }, { status: 400 })
  }

  const target = await prisma.user.findUnique({ where: { id }, select: { role: true, status: true } })
  if (!target || !(PMB_ROLES as readonly string[]).includes(target.role)) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
  }

  if (target.role === "SUPER_ADMIN") {
    const activeSupers = await prisma.user.count({
      where: { role: "SUPER_ADMIN", status: "ATIVO", NOT: { id } },
    })
    if (activeSupers === 0) {
      return NextResponse.json({ error: "É necessário ao menos um Super Admin ativo" }, { status: 409 })
    }
  }

  await prisma.user.update({ where: { id }, data: { status: "INATIVO" } })
  return NextResponse.json({ data: { id, status: "INATIVO" } })
  },
)
