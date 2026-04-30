import { prisma } from "@/lib/prisma"
import type {
  NotificationLevel,
  NotificationAudience,
  UserRole,
} from "@prisma/client"

/**
 * Cria notificacoes in-app. Existem 4 audiencias:
 *
 * - USER: para um User especifico (admin/equipe/revendedor) — userId obrigatorio
 * - STUDENT: para um Student — studentId obrigatorio
 * - TENANT: para todos os usuarios com TenantMember + owner do tenant —
 *   tenantId obrigatorio (sera entregue como N notificacoes USER)
 * - ROLE: para todos os Users com aquele papel — roleTarget obrigatorio
 *
 * Nunca lanca: emails ja sao melhor esforco; notificacao in-app idem.
 */

interface BaseInput {
  level?: NotificationLevel
  title: string
  body?: string
  category?: string
  href?: string
}

interface UserInput extends BaseInput {
  audience: "USER"
  userId: string
}
interface StudentInput extends BaseInput {
  audience: "STUDENT"
  studentId: string
}
interface TenantInput extends BaseInput {
  audience: "TENANT"
  tenantId: string
}
interface RoleInput extends BaseInput {
  audience: "ROLE"
  roleTarget: UserRole
}

export type CreateNotificationInput =
  | UserInput
  | StudentInput
  | TenantInput
  | RoleInput

export async function createNotification(
  input: CreateNotificationInput,
): Promise<void> {
  try {
    if (input.audience === "TENANT") {
      // Expande para todos os Users do tenant (owner + memberships)
      const [owner, members] = await Promise.all([
        prisma.user.findFirst({
          where: { tenantId: input.tenantId },
          select: { id: true },
        }),
        prisma.tenantMember.findMany({
          where: { tenantId: input.tenantId },
          select: { userId: true },
        }),
      ])
      const userIds = new Set<string>()
      if (owner) userIds.add(owner.id)
      for (const m of members) userIds.add(m.userId)

      if (userIds.size === 0) return
      await prisma.notification.createMany({
        data: [...userIds].map((userId) => ({
          audience: "USER" as const,
          userId,
          tenantId: input.tenantId,
          level: input.level ?? "INFO",
          title: input.title,
          body: input.body ?? null,
          category: input.category ?? null,
          href: input.href ?? null,
        })),
      })
      return
    }

    if (input.audience === "ROLE") {
      const users = await prisma.user.findMany({
        where: { role: input.roleTarget, status: "ATIVO" },
        select: { id: true },
      })
      if (users.length === 0) return
      await prisma.notification.createMany({
        data: users.map((u) => ({
          audience: "USER" as const,
          userId: u.id,
          roleTarget: input.roleTarget,
          level: input.level ?? "INFO",
          title: input.title,
          body: input.body ?? null,
          category: input.category ?? null,
          href: input.href ?? null,
        })),
      })
      return
    }

    const data: Parameters<typeof prisma.notification.create>[0]["data"] = {
      audience: input.audience as NotificationAudience,
      level: input.level ?? "INFO",
      title: input.title,
      body: input.body ?? null,
      category: input.category ?? null,
      href: input.href ?? null,
    }
    if (input.audience === "USER") data.userId = input.userId
    if (input.audience === "STUDENT") data.studentId = input.studentId

    await prisma.notification.create({ data })
  } catch (err) {
    console.error("[notifications] create falhou:", err)
  }
}

interface ScopeForUser {
  userId: string
  role: UserRole
  tenantId?: string | null
}

/**
 * Lista as notificacoes visiveis para um User (admin/equipe/revendedor).
 * Inclui: USER (proprias) + ROLE (papel) + TENANT (do tenant que pertence).
 * Em pratica today todas as TENANT/ROLE viram USER no createNotification, mas
 * mantemos a leitura tolerante.
 */
export async function listForUser(
  scope: ScopeForUser,
  options: { limit?: number; onlyUnread?: boolean } = {},
) {
  const limit = options.limit ?? 50
  return prisma.notification.findMany({
    where: {
      OR: [
        { userId: scope.userId },
        { roleTarget: scope.role },
        ...(scope.tenantId
          ? [{ tenantId: scope.tenantId, audience: "TENANT" as const }]
          : []),
      ],
      ...(options.onlyUnread ? { readAt: null } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  })
}

export async function listForStudent(
  studentId: string,
  options: { limit?: number; onlyUnread?: boolean } = {},
) {
  const limit = options.limit ?? 50
  return prisma.notification.findMany({
    where: {
      studentId,
      ...(options.onlyUnread ? { readAt: null } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  })
}

export async function markAsRead(
  notificationId: string,
  ownerCheck:
    | { kind: "user"; userId: string; role: UserRole; tenantId?: string | null }
    | { kind: "student"; studentId: string },
): Promise<boolean> {
  const where =
    ownerCheck.kind === "user"
      ? {
          id: notificationId,
          OR: [
            { userId: ownerCheck.userId },
            { roleTarget: ownerCheck.role },
            ...(ownerCheck.tenantId
              ? [
                  {
                    tenantId: ownerCheck.tenantId,
                    audience: "TENANT" as const,
                  },
                ]
              : []),
          ],
        }
      : { id: notificationId, studentId: ownerCheck.studentId }

  const result = await prisma.notification.updateMany({
    where,
    data: { readAt: new Date() },
  })
  return result.count > 0
}

export async function markAllAsRead(
  ownerCheck:
    | { kind: "user"; userId: string; role: UserRole; tenantId?: string | null }
    | { kind: "student"; studentId: string },
): Promise<number> {
  const where =
    ownerCheck.kind === "user"
      ? {
          readAt: null,
          OR: [
            { userId: ownerCheck.userId },
            { roleTarget: ownerCheck.role },
            ...(ownerCheck.tenantId
              ? [
                  {
                    tenantId: ownerCheck.tenantId,
                    audience: "TENANT" as const,
                  },
                ]
              : []),
          ],
        }
      : { readAt: null, studentId: ownerCheck.studentId }

  const result = await prisma.notification.updateMany({
    where,
    data: { readAt: new Date() },
  })
  return result.count
}
