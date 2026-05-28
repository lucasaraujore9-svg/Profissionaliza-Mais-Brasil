import { prisma } from "@/lib/prisma"
import type {
  NotificationLevel,
  NotificationAudience,
  UserRole,
} from "@prisma/client"
import { sendPushToTarget, sendPushToUsers } from "@/lib/notifications/push-server"
import { contextLogger } from "@/lib/logger"

export type NotificationConfigTarget = "TENANT" | "STUDENT" | "ADMIN"

/**
 * Categorias da audiencia TENANT que pertencem ao DONO da revenda (financeiro
 * e comissoes de indicacao). Nao devem ser entregues aos consultores
 * (TenantMember) — so ao owner do tenant.
 */
const OWNER_ONLY_TENANT_CATEGORIES = new Set<string>([
  "tenant-billing",
  "referral",
])

function audienceToConfigTarget(
  audience: NotificationAudience,
): NotificationConfigTarget {
  switch (audience) {
    case "STUDENT":
      return "STUDENT"
    case "TENANT":
      return "TENANT"
    case "ROLE":
    case "USER":
      return "ADMIN"
  }
}

/**
 * Kill-switch global: se a categoria estiver desligada em
 * `notification_category_configs` para aquele target, nao cria
 * notificacao nem dispara push. Categorias sem registro sao tratadas
 * como ENABLED (compat com automaticos que nao caem no admin UI ainda).
 */
async function isCategoryEnabled(
  target: NotificationConfigTarget,
  category: string | undefined,
): Promise<boolean> {
  if (!category) return true
  try {
    const cfg = await prisma.notificationCategoryConfig.findUnique({
      where: { target_category: { target, category } },
      select: { enabled: true },
    })
    return cfg?.enabled !== false
  } catch {
    return true
  }
}

/**
 * Combina kill-switch global (target=STUDENT) com override por tenant.
 * Regra: global=false bloqueia tudo · global=true + override=false bloqueia
 * apenas neste tenant · global=true sem override envia normalmente.
 */
async function isStudentCategoryEnabled(
  category: string | undefined,
  studentId: string,
): Promise<boolean> {
  if (!category) return true
  if (!(await isCategoryEnabled("STUDENT", category))) return false
  try {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { tenantId: true },
    })
    if (!student?.tenantId) return true
    const override = await prisma.tenantNotificationOverride.findUnique({
      where: { tenantId_category: { tenantId: student.tenantId, category } },
      select: { enabled: true },
    })
    return override?.enabled !== false
  } catch {
    return true
  }
}

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

/**
 * Verifica se o usuario/aluno deseja receber este canal+categoria.
 * Default: true. So bloqueia se houver registro explicito desligando.
 */
async function isChannelEnabled(
  channel: "in_app" | "email",
  category: string | undefined,
  target: { userId?: string; studentId?: string },
): Promise<boolean> {
  if (!category) return true
  const where = target.userId
    ? { userId: target.userId, category }
    : target.studentId
      ? { studentId: target.studentId, category }
      : null
  if (!where) return true

  const pref = await prisma.notificationPreference.findFirst({
    where,
    select: { inApp: true, email: true },
  })
  if (!pref) return true
  return channel === "in_app" ? pref.inApp : pref.email
}

export async function shouldSendEmail(
  category: string | undefined,
  target: { userId?: string; studentId?: string },
): Promise<boolean> {
  return isChannelEnabled("email", category, target)
}

/**
 * Cria a(s) notificacao(oes) e dispara push (best-effort). Para audiencias de
 * alvo unico (USER/STUDENT) retorna `{ id }` da linha criada; para fan-out
 * (TENANT/ROLE) ou quando nada e criado (categoria desligada/preferencia off)
 * retorna `null`. Nunca lanca.
 */
export async function createNotification(
  input: CreateNotificationInput,
): Promise<{ id: string } | null> {
  try {
    // Para STUDENT, o gate combina global + override por tenant; e feito mais
    // abaixo, no proprio branch da audience. Para os demais, basta o global.
    if (
      input.audience !== "STUDENT" &&
      !(await isCategoryEnabled(audienceToConfigTarget(input.audience), input.category))
    ) {
      return null
    }
    if (input.audience === "TENANT") {
      // Expande para os Users do tenant (owner + memberships). Categorias
      // financeiras (cobranca da revenda, comissoes) sao so do dono — nao
      // vazam para consultores.
      const ownerOnly = input.category
        ? OWNER_ONLY_TENANT_CATEGORIES.has(input.category)
        : false
      const [owner, members] = await Promise.all([
        prisma.user.findFirst({
          where: { tenantId: input.tenantId },
          select: { id: true },
        }),
        ownerOnly
          ? Promise.resolve([] as { userId: string }[])
          : prisma.tenantMember.findMany({
              where: { tenantId: input.tenantId },
              select: { userId: true },
            }),
      ])
      const userIds = new Set<string>()
      if (owner) userIds.add(owner.id)
      for (const m of members) userIds.add(m.userId)

      if (userIds.size === 0) return null
      // Filtra cada userId pelas suas preferencias in-app
      const enabled = await Promise.all(
        [...userIds].map(async (userId) =>
          (await isChannelEnabled("in_app", input.category, { userId }))
            ? userId
            : null,
        ),
      )
      const filteredUserIds = enabled.filter((u): u is string => u !== null)
      if (filteredUserIds.length === 0) return null

      await prisma.notification.createMany({
        data: filteredUserIds.map((userId) => ({
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
      // push em paralelo (best-effort, nao bloqueia)
      void sendPushToUsers(filteredUserIds, {
        title: input.title,
        body: input.body,
        href: input.href,
        level: input.level,
        category: input.category,
        tag: input.category ?? "pmb-tenant",
      })
      return null
    }

    if (input.audience === "ROLE") {
      const users = await prisma.user.findMany({
        where: { role: input.roleTarget, status: "ATIVO" },
        select: { id: true },
      })
      if (users.length === 0) return null
      const enabled = await Promise.all(
        users.map(async (u) =>
          (await isChannelEnabled("in_app", input.category, { userId: u.id }))
            ? u.id
            : null,
        ),
      )
      const filteredUserIds = enabled.filter((u): u is string => u !== null)
      if (filteredUserIds.length === 0) return null

      await prisma.notification.createMany({
        data: filteredUserIds.map((userId) => ({
          audience: "USER" as const,
          userId,
          roleTarget: input.roleTarget,
          level: input.level ?? "INFO",
          title: input.title,
          body: input.body ?? null,
          category: input.category ?? null,
          href: input.href ?? null,
        })),
      })
      void sendPushToUsers(filteredUserIds, {
        title: input.title,
        body: input.body,
        href: input.href,
        level: input.level,
        category: input.category,
        tag: input.category ?? "pmb-role",
      })
      return null
    }

    // USER ou STUDENT — checa preferencia individual
    const target =
      input.audience === "USER"
        ? { userId: input.userId }
        : { studentId: input.studentId }
    // Gate global + override por tenant para STUDENT
    if (
      input.audience === "STUDENT" &&
      !(await isStudentCategoryEnabled(input.category, input.studentId))
    ) {
      return null
    }
    if (!(await isChannelEnabled("in_app", input.category, target))) {
      return null
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

    const created = await prisma.notification.create({ data, select: { id: true } })

    void sendPushToTarget(
      input.audience === "USER"
        ? { userId: input.userId }
        : { studentId: input.studentId },
      {
        title: input.title,
        body: input.body,
        href: input.href,
        level: input.level,
        category: input.category,
        tag: input.category ?? "pmb-notif",
        notificationId: created.id,
      },
    )

    return { id: created.id }
  } catch (err) {
    contextLogger().error(
      { err, event: "notifications.create_failed", category: input.category, audience: input.audience },
      "criar notificação falhou",
    )
    return null
  }
}

interface ScopeForUser {
  userId: string
  role: UserRole
  tenantId?: string | null
}

/**
 * Lista as notificacoes visiveis para um User (admin/equipe/revendedor).
 *
 * `createNotification` SEMPRE materializa TENANT/ROLE como N linhas USER (uma
 * por destinatario, com `userId` proprio). Por isso casamos apenas por
 * `userId` — NAO por `roleTarget`. Casar por roleTarget faria cada usuario ver
 * (e poder marcar como lida) as copias de TODOS os outros do mesmo papel,
 * duplicando o feed e corrompendo o estado de leitura entre eles.
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

/**
 * Conta as notificacoes nao-lidas de um User. Espelha o `where` de
 * `listForUser` mas sem `take`, para o badge nao ficar limitado ao tamanho
 * da pagina retornada.
 */
export async function countUnreadForUser(scope: ScopeForUser): Promise<number> {
  return prisma.notification.count({
    where: {
      readAt: null,
      OR: [
        { userId: scope.userId },
        ...(scope.tenantId
          ? [{ tenantId: scope.tenantId, audience: "TENANT" as const }]
          : []),
      ],
    },
  })
}

export async function countUnreadForStudent(studentId: string): Promise<number> {
  return prisma.notification.count({ where: { studentId, readAt: null } })
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
