import { prisma } from "@/lib/prisma"
import type {
  NotificationLevel,
  NotificationAudience,
  UserRole,
} from "@prisma/client"
import { sendPushToTarget, sendPushToUsers } from "@/lib/notifications/push-server"
import { contextLogger } from "@/lib/logger"
import { sendEmail } from "@/lib/email/mailer"
import {
  PMB_EMAIL_BRAND,
  emailFromForBrand,
  type EmailBrand,
} from "@/lib/email/brand"
import { loadTenantEmailBrand } from "@/lib/email/tenant-brand"
import { appUrl } from "@/lib/tenant/urls"
import { afterResponse } from "@/lib/after-response"
import {
  normalizeMemberRole,
  resolvePermissions,
  type PainelPermission,
} from "@/lib/auth/painel-permissions"

/**
 * Categorias cujas notificações também viram EMAIL (ponte notificação→email).
 * Curadoria deliberada: só eventos transacionais de alto valor — para não
 * transformar cada aviso in-app em email (firehose). Demais categorias seguem
 * só in-app + push. O envio ainda respeita a preferência individual de email
 * (`NotificationPreference.email`) e os kill-switches de categoria já aplicados
 * antes de chegar aqui.
 */
const EMAIL_BRIDGE_CATEGORIES = new Set<string>([
  "payment",
  "enrollment",
  "sale",
  "certificate",
  "referral",
  "tenant-billing",
  "fulfillment",
])

type EmailRecipient =
  | { kind: "user"; userId: string }
  | { kind: "student"; studentId: string }

/**
 * Espelha por email uma notificação in-app, para os destinatários cuja
 * preferência de email está ligada. Best-effort e em background (`afterResponse`):
 * nunca bloqueia nem derruba a criação da notificação. Usa o template genérico
 * `notification` com a marca da unidade (revenda nunca exibe marca PMB).
 */
async function dispatchNotificationEmails(
  meta: { title: string; body?: string | null; href?: string | null; category?: string },
  recipients: EmailRecipient[],
): Promise<void> {
  if (!meta.category || !EMAIL_BRIDGE_CATEGORIES.has(meta.category)) return
  if (recipients.length === 0) return

  for (const r of recipients) {
    try {
      const target = r.kind === "user" ? { userId: r.userId } : { studentId: r.studentId }
      if (!(await isChannelEnabled("email", meta.category, target))) continue

      let to: string | null = null
      let brandTenantId: string | null = null
      if (r.kind === "user") {
        const u = await prisma.user.findUnique({
          where: { id: r.userId },
          select: { email: true, tenantId: true },
        })
        if (!u?.email) continue
        to = u.email
        brandTenantId = u.tenantId
      } else {
        const s = await prisma.student.findUnique({
          where: { id: r.studentId },
          select: { email: true, tenantId: true },
        })
        if (!s?.email) continue
        to = s.email
        brandTenantId = s.tenantId
      }

      const brand: EmailBrand = brandTenantId
        ? await loadTenantEmailBrand(brandTenantId)
        : PMB_EMAIL_BRAND
      const base = (brand.siteUrl ?? appUrl()).replace(/\/$/, "")
      const ctaUrl = meta.href
        ? meta.href.startsWith("http")
          ? meta.href
          : `${base}${meta.href}`
        : null

      await sendEmail({
        to,
        from: emailFromForBrand(brand),
        replyTo: brand.replyTo ?? undefined,
        tenantId: brand.isPmb ? null : brandTenantId,
        subject: meta.title,
        template: {
          type: "notification",
          props: { title: meta.title, body: meta.body ?? null, ctaUrl, brand },
        },
      })
    } catch (err) {
      contextLogger().error(
        { err, event: "notifications.email_bridge_failed", category: meta.category },
        "ponte notificação→email falhou",
      )
    }
  }
}

export type NotificationConfigTarget = "TENANT" | "STUDENT" | "ADMIN"

/**
 * Categorias da audiencia TENANT que exigem uma PERMISSAO especifica do membro.
 * Antes eram "so o dono"; agora o dono pode delegar (ex.: dar `cobrancas.view`
 * ao Financeiro da unidade) e a notificacao acompanha a delegacao. Categoria
 * fora deste mapa vai para todo mundo da unidade.
 */
const CATEGORY_PERMISSION: Record<string, PainelPermission> = {
  "tenant-billing": "cobrancas.view",
  referral: "indicacoes.view",
  // Aviso de WhatsApp desconectado: só faz sentido para quem alcança a tela de
  // Automação — é lá que se reconecta.
  automacao: "automacao.view",
}

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
  /**
   * Desliga a ponte notificação→email para ESTA notificação. Use quando o call
   * site já dispara um email transacional dedicado para o mesmo evento (ex.:
   * matrícula confirmada, cobrança da revenda) — evita o aluno/dono receber o
   * email dedicado E o genérico da ponte. Não afeta a notificação in-app/push.
   */
  suppressEmail?: boolean
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

/**
 * PERF-007: versão BATCHED de `isChannelEnabled` para o canal in_app num fan-out.
 * Em vez de 1 `findFirst` por usuário (N round-trips ao pool), faz UMA `findMany`
 * de todas as preferências da categoria para o conjunto de usuários e resolve as
 * flags em memória (default `true` quando ausente — mesma semântica do singular).
 * `category` ausente => todos habilitados (sem gate por preferência).
 */
export async function filterUserIdsByInAppPreference(
  userIds: string[],
  category: string | undefined,
): Promise<string[]> {
  if (userIds.length === 0) return []
  if (!category) return userIds
  const prefs = await prisma.notificationPreference.findMany({
    where: { userId: { in: userIds }, category },
    select: { userId: true, inApp: true },
  })
  const disabled = new Set(
    prefs.filter((p) => p.inApp === false && p.userId != null).map((p) => p.userId as string),
  )
  return userIds.filter((id) => !disabled.has(id))
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
      // sensiveis (cobranca da unidade, comissoes) so vao para quem tem a
      // permissao correspondente — o dono sempre tem; um membro so se o dono
      // concedeu em /painel/equipe.
      const requiredPerm = input.category
        ? CATEGORY_PERMISSION[input.category]
        : undefined
      const [owner, members] = await Promise.all([
        prisma.user.findFirst({
          where: { tenantId: input.tenantId },
          select: { id: true },
        }),
        prisma.tenantMember.findMany({
          where: { tenantId: input.tenantId, status: "ATIVO" },
          select: {
            userId: true,
            role: true,
            extraPermissions: true,
            revokedPermissions: true,
          },
        }),
      ])
      const userIds = new Set<string>()
      if (owner) userIds.add(owner.id)
      for (const m of members) {
        if (requiredPerm) {
          const perms = resolvePermissions(
            normalizeMemberRole(m.role),
            m.extraPermissions,
            m.revokedPermissions,
          )
          if (!perms.has(requiredPerm)) continue
        }
        userIds.add(m.userId)
      }

      if (userIds.size === 0) return null

      // Ponte email sobre o conjunto candidato COMPLETO, ANTES do filtro in-app
      // e do early-return abaixo: o canal email é independente do in-app (um
      // destinatário pode ter in-app desligado e email ligado). O helper aplica
      // a preferência de email por destinatário. Se ficasse após o filtro, um
      // fan-out em que todos têm in-app off engoliria os emails silenciosamente.
      if (!input.suppressEmail) {
        afterResponse(() =>
          dispatchNotificationEmails(
            { title: input.title, body: input.body, href: input.href, category: input.category },
            [...userIds].map((userId) => ({ kind: "user", userId })),
          ),
        )
      }

      // Filtra pelas preferencias in-app dos usuarios numa UNICA query (PERF-007).
      const filteredUserIds = await filterUserIdsByInAppPreference(
        [...userIds],
        input.category,
      )
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
      // Push em background (best-effort, nao bloqueia) — mas via `after()`, nao
      // como promise solta: a instancia serverless congela ao enviar a resposta
      // e mataria o envio no meio do caminho.
      afterResponse(() =>
        sendPushToUsers(filteredUserIds, {
          title: input.title,
          body: input.body,
          href: input.href,
          level: input.level,
          category: input.category,
          tag: input.category ?? "pmb-tenant",
        }),
      )
      return null
    }

    if (input.audience === "ROLE") {
      const users = await prisma.user.findMany({
        where: { role: input.roleTarget, status: "ATIVO" },
        select: { id: true },
      })
      if (users.length === 0) return null

      // Ponte email sobre o conjunto candidato COMPLETO, ANTES do filtro in-app
      // e do early-return abaixo (mesma razão do branch TENANT): email é
      // independente do in-app; o helper aplica a preferência de email por
      // destinatário.
      if (!input.suppressEmail) {
        afterResponse(() =>
          dispatchNotificationEmails(
            { title: input.title, body: input.body, href: input.href, category: input.category },
            users.map((u) => ({ kind: "user", userId: u.id })),
          ),
        )
      }

      const filteredUserIds = await filterUserIdsByInAppPreference(
        users.map((u) => u.id),
        input.category,
      )
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
      afterResponse(() =>
        sendPushToUsers(filteredUserIds, {
          title: input.title,
          body: input.body,
          href: input.href,
          level: input.level,
          category: input.category,
          tag: input.category ?? "pmb-role",
        }),
      )
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
    // Ponte email — independente do canal in-app (um destinatário pode preferir
    // só email). Já passou pelos gates de categoria acima; o helper aplica a
    // preferência de email. Disparada antes do gate in-app de propósito.
    if (!input.suppressEmail) {
      afterResponse(() =>
        dispatchNotificationEmails(
          { title: input.title, body: input.body, href: input.href, category: input.category },
          [
            input.audience === "USER"
              ? { kind: "user", userId: input.userId }
              : { kind: "student", studentId: input.studentId },
          ],
        ),
      )
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

    afterResponse(() =>
      sendPushToTarget(
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
      ),
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
