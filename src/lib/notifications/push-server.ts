import "server-only"
import webpush from "web-push"
import { prisma } from "@/lib/prisma"
import type { NotificationLevel } from "@prisma/client"
import { swallow } from "@/lib/errors"
import { contextLogger } from "@/lib/logger"

// VAPID config (gerar com `npx web-push generate-vapid-keys`):
//   VAPID_PUBLIC_KEY  — exposto ao client via /api/push/public-key
//   VAPID_PRIVATE_KEY — segredo, server-only
//   VAPID_SUBJECT     — mailto:contato@... (RFC 8292)
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? ""
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? ""
const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT ?? "mailto:contato@profissionalizamaisbrasil.com.br"

let vapidConfigured = false

function ensureVapid(): boolean {
  if (vapidConfigured) return true
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return false
  }
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
    vapidConfigured = true
    return true
  } catch (err) {
    contextLogger().error(
      { err, event: "push.vapid_invalid" },
      "VAPID keys inválidas — push desabilitado",
    )
    return false
  }
}

export function isPushConfigured(): boolean {
  return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY)
}

export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY
}

interface PushPayload {
  title: string
  body?: string | null
  href?: string | null
  level?: NotificationLevel
  category?: string | null
  // tag agrupa notificacoes: se nova chega com mesma tag, substitui a anterior
  tag?: string
  // notificationId — usado pelo SW para marcar como lida ao clicar
  notificationId?: string
}

interface DispatchTarget {
  userId?: string | null
  studentId?: string | null
}

type SubRow = { id: string; endpoint: string; p256dh: string; auth: string }

function serializePayload(payload: PushPayload): string {
  return JSON.stringify({
    title: payload.title,
    body: payload.body ?? "",
    href: payload.href ?? "/",
    level: payload.level ?? "INFO",
    category: payload.category ?? null,
    tag: payload.tag ?? payload.category ?? "pmb-notif",
    notificationId: payload.notificationId ?? null,
  })
}

/**
 * Dispara `body` (JSON já serializado) para uma lista de subscriptions.
 * Remove silenciosamente assinaturas 404/410 (Gone) e incrementa failureCount
 * em erros transientes — quando passa de 5, remove tambem.
 * Nunca lanca — push e best-effort, igual a email.
 */
async function dispatchToSubscriptions(
  subs: SubRow[],
  body: string,
): Promise<void> {
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
          { TTL: 60 * 60 * 24 }, // 24h
        )
        await prisma.pushSubscription
          .update({
            where: { id: sub.id },
            data: { lastUsedAt: new Date(), failureCount: 0 },
          })
          .catch(swallow("push-server"))
      } catch (err: unknown) {
        const status =
          (err as { statusCode?: number }).statusCode ??
          (err as { status?: number }).status
        // 404 / 410 = subscription morta (RFC 8030) — remover de vez
        if (status === 404 || status === 410) {
          await prisma.pushSubscription
            .delete({ where: { id: sub.id } })
            .catch(swallow("push-server"))
          return
        }
        // erros transientes — incrementa contador, remove se passar de 5
        await prisma.pushSubscription
          .update({
            where: { id: sub.id },
            data: { failureCount: { increment: 1 } },
          })
          .catch(swallow("push-server"))
        const next = await prisma.pushSubscription
          .findUnique({ where: { id: sub.id }, select: { failureCount: true } })
          .catch(() => null)
        if (next && next.failureCount > 5) {
          await prisma.pushSubscription
            .delete({ where: { id: sub.id } })
            .catch(swallow("push-server"))
        }
        contextLogger().warn(
          { err, event: "push.send_failed", status, subscriptionId: sub.id },
          "envio de push falhou",
        )
      }
    }),
  )
}

/**
 * Envia 1 payload para todas as subscriptions de 1 alvo (user ou student).
 * Nunca lanca — push e best-effort.
 */
export async function sendPushToTarget(
  target: DispatchTarget,
  payload: PushPayload,
): Promise<void> {
  if (!ensureVapid()) return
  if (!target.userId && !target.studentId) return

  const subs = await prisma.pushSubscription.findMany({
    where: target.userId
      ? { userId: target.userId }
      : { studentId: target.studentId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  })
  if (subs.length === 0) return

  await dispatchToSubscriptions(subs, serializePayload(payload))
}

/**
 * Campanha de push para visitantes anônimos (sem login) que assinaram pelo
 * banner do site. Filtra por unidade quando `tenantId` é informado; sem ele,
 * atinge anônimos do site institucional PMB (tenant_id NULL).
 *
 * Use `scope: "all"` para atingir TODOS os anônimos, independente de unidade.
 *
 * Pagina por cursor para não carregar a tabela inteira na memória.
 * Nunca lanca — push e best-effort.
 */
export async function sendPushToAnonymous(
  opts: { tenantId?: string | null; scope?: "tenant" | "all" },
  payload: PushPayload,
): Promise<number> {
  if (!ensureVapid()) return 0

  const where =
    opts.scope === "all"
      ? { userId: null, studentId: null }
      : { userId: null, studentId: null, tenantId: opts.tenantId ?? null }

  const body = serializePayload(payload)
  const BATCH = 500
  let cursor: string | undefined
  let sent = 0

  while (true) {
    const subs: SubRow[] = await prisma.pushSubscription.findMany({
      where,
      select: { id: true, endpoint: true, p256dh: true, auth: true },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    })
    if (subs.length === 0) break
    cursor = subs[subs.length - 1].id
    await dispatchToSubscriptions(subs, body)
    sent += subs.length
    if (subs.length < BATCH) break
  }

  return sent
}

/**
 * Despacha push para multiplos User ids — usado por broadcast TENANT / ROLE.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
): Promise<void> {
  if (userIds.length === 0) return
  await Promise.all(
    userIds.map((userId) => sendPushToTarget({ userId }, payload)),
  )
}
