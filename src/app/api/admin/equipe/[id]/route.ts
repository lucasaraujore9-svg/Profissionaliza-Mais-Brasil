import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { logAudit } from "@/lib/audit"
import { PMB_TEAM_ROLES, isPmbTeamRole } from "@/lib/auth/roles"
import {
  ADMIN_PERMISSIONS,
  SUPER_EXCLUSIVE,
  filterAdminPermissions,
  resolveAdminPermissions,
} from "@/lib/auth/admin-permissions"

const SUPER_EXCLUSIVE_SET = new Set<string>(SUPER_EXCLUSIVE)

const permissionList = z
  .array(z.enum(ADMIN_PERMISSIONS))
  .max(ADMIN_PERMISSIONS.length)
import { requireAdmin } from "@/lib/auth/admin-guard"

export const GET = withRequestContextParams<{ id: string }>(
  { action: "admin.equipe.get", route: "/api/admin/equipe/[id]" },
  async (_req: Request, ctx) => {
  const guard = await requireAdmin("equipe.manage")
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
      salesManagerId: true,
      salesManager: { select: { name: true } },
      maxDiscount: true,
      extraPermissions: true,
      revokedPermissions: true,
    },
  })

  if (!user || !isPmbTeamRole(user.role)) {
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
      salesManagerId: user.salesManagerId,
      salesManagerName: user.salesManager?.name ?? null,
      maxDiscount: user.maxDiscount,
      extraPermissions: filterAdminPermissions(user.extraPermissions),
      revokedPermissions: filterAdminPermissions(user.revokedPermissions),
      permissions: [
        ...resolveAdminPermissions(
          user.role,
          user.extraPermissions,
          user.revokedPermissions,
        ),
      ],
    },
  })
  },
)

const patchSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  role: z.enum(PMB_TEAM_ROLES).optional(),
  status: z.enum(["ATIVO", "INATIVO"]).optional(),
  phone: z.string().nullable().optional(),
  image: z.string().url().nullable().optional(),
  // Gerente de vendas do vendedor de revenda. Zerado se o papel não for
  // PMB_REVENDA_SALES (validado abaixo).
  salesManagerId: z.string().nullable().optional(),
  // Cap individual de desconto (%) nas vendas diretas. Zerado se o papel não
  // for PMB_SALES (normalizado abaixo). null = padrão da role (50).
  maxDiscount: z.number().int().min(0).max(100).nullable().optional(),
  extraPermissions: permissionList.optional(),
  revokedPermissions: permissionList.optional(),
})

export const PATCH = withRequestContextParams<{ id: string }>(
  { action: "admin.equipe.update", route: "/api/admin/equipe/[id]" },
  async (req: Request, ctx) => {
  const guard = await requireAdmin("equipe.manage")
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

  // Barreira de escalada: gerir a equipe continua exclusivo do Super Admin,
  // mesmo via ajuste individual — é a permissão que permitiria a uma pessoa
  // ampliar os próprios poderes.
  const escalating = (parsed.data.extraPermissions ?? []).filter((perm) =>
    SUPER_EXCLUSIVE_SET.has(perm),
  )
  if (escalating.length > 0) {
    return NextResponse.json(
      {
        error: "Estas permissões são exclusivas do Super Admin",
        fields: { extraPermissions: escalating },
      },
      { status: 400 },
    )
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      role: true,
      extraPermissions: true,
      revokedPermissions: true,
    },
  })
  if (!target || !isPmbTeamRole(target.role)) {
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

  // Normaliza o vínculo com gerente de vendas: só vendedor de revenda o tem.
  const data = { ...parsed.data }
  const effectiveRole = data.role ?? target.role

  // Trocar de papel zera os ajustes finos que o chamador não reenviou: os
  // overrides do papel anterior quase nunca fazem sentido no novo e produziriam
  // combinações surpreendentes (ex.: um "revoga financeiro" herdado num
  // Financeiro). A UI já manda as listas vazias; isto cobre outros clientes.
  if (data.role !== undefined && data.role !== target.role) {
    data.extraPermissions ??= []
    data.revokedPermissions ??= []
  }

  // Cap individual de desconto: vale para QUEM VENDE, nao para um papel. Zerar
  // por `role !== "PMB_SALES"` fazia o admin configurar 10% para alguem que
  // recebeu `vendas.create` por override e o campo virar null — caindo no
  // padrao de 50%, cinco vezes o teto pretendido, sem erro na tela.
  const podeVender = resolveAdminPermissions(
    effectiveRole,
    data.extraPermissions ?? target.extraPermissions,
    data.revokedPermissions ?? target.revokedPermissions,
  ).has("vendas.create")
  if (!podeVender && (data.role !== undefined || data.maxDiscount !== undefined)) {
    data.maxDiscount = null
  }

  if (effectiveRole !== "PMB_REVENDA_SALES") {
    // Papel não-comercial-de-revenda nunca mantém gerente atribuído.
    if (data.role !== undefined || data.salesManagerId !== undefined) {
      data.salesManagerId = null
    }
  } else if (data.salesManagerId) {
    const mgr = await prisma.user.findUnique({
      where: { id: data.salesManagerId },
      select: { role: true, status: true },
    })
    if (!mgr || mgr.role !== "PMB_SALES_MGR" || mgr.status !== "ATIVO") {
      return NextResponse.json(
        { error: "Gerente de vendas inválido ou inativo" },
        { status: 400 },
      )
    }
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      maxDiscount: true,
      extraPermissions: true,
      revokedPermissions: true,
    },
  })

  // SAAS-001: trilha de auditoria de alteração de papel/status/cap (permissão).
  await logAudit({
    action: "user.role_update",
    resource: "User",
    resourceId: id,
    actorUserId: guard.ctx.userId,
    actorRole: guard.ctx.role,
    payloadBefore: {
      role: target.role,
      extraPermissions: target.extraPermissions,
      revokedPermissions: target.revokedPermissions,
    },
    payloadAfter: {
      role: updated.role,
      status: updated.status,
      maxDiscount: updated.maxDiscount,
      extraPermissions: updated.extraPermissions,
      revokedPermissions: updated.revokedPermissions,
    },
  })

  return NextResponse.json({ data: updated })
  },
)

export const DELETE = withRequestContextParams<{ id: string }>(
  { action: "admin.equipe.delete", route: "/api/admin/equipe/[id]" },
  async (_req: Request, ctx) => {
  const guard = await requireAdmin("equipe.manage")
  if (!guard.ok) return guard.response
  const { id } = await ctx.params

  if (id === guard.ctx.userId) {
    return NextResponse.json({ error: "Você não pode se desativar" }, { status: 400 })
  }

  const target = await prisma.user.findUnique({ where: { id }, select: { role: true, status: true } })
  if (!target || !isPmbTeamRole(target.role)) {
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

  // SAAS-001: trilha de auditoria de desativação de membro da equipe.
  await logAudit({
    action: "user.deactivate",
    resource: "User",
    resourceId: id,
    actorUserId: guard.ctx.userId,
    actorRole: guard.ctx.role,
    payloadBefore: { role: target.role, status: target.status },
    payloadAfter: { status: "INATIVO" },
  })

  return NextResponse.json({ data: { id, status: "INATIVO" } })
  },
)
