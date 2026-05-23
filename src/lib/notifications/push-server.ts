import "server-only"
import webpush from "web-push"
import { prisma } from "@/lib/prisma"
import type { NotificationLevel } from "@prisma/client"

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
    console.error("[push] VAPID invalida:", err)
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

/**
 * Envia 1 payload para todas as subscriptions de 1 alvo (user ou student).
 * Remove silenciosamente assinaturas 404/410 (Gone) e incrementa failureCount
 * em erros transientes — quando passa de 5, remove tambem.
 *
 * Nunca lanca — push e best-effort, igual a email.
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

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body ?? "",
    href: payload.href ?? "/",
    level: payload.level ?? "INFO",
    category: payload.category ?? null,
    tag: payload.tag ?? payload.category ?? "pmb-notif",
    notificationId: payload.notificationId ?? null,
  })

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
          .catch(() => undefined)
      } catch (err: unknown) {
        const status =
          (err as { statusCode?: number }).statusCode ??
          (err as { status?: number }).status
        // 404 / 410 = subscription morta (RFC 8030) — remover de vez
        if (status === 404 || status === 410) {
          await prisma.pushSubscription
            .delete({ where: { id: sub.id } })
            .catch(() => undefined)
          return
        }
        // erros transientes — incrementa contador, remove se passar de 5
        await prisma.pushSubscription
          .update({
            where: { id: sub.id },
            data: { failureCount: { increment: 1 } },
          })
          .catch(() => undefined)
        const next = await prisma.pushSubscription
          .findUnique({ where: { id: sub.id }, select: { failureCount: true } })
          .catch(() => null)
        if (next && next.failureCount > 5) {
          await prisma.pushSubscription
            .delete({ where: { id: sub.id } })
            .catch(() => undefined)
        }
        console.warn("[push] envio falhou", status, err)
      }
    }),
  )
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
