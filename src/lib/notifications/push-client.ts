// Helpers client-side para Web Push API.
//
// Fluxo:
//  1. Verifica suporte (isPushSupported)
//  2. Pede permissao + cria PushSubscription via SW (subscribeToPush)
//  3. POSTa keys para /api/push/subscribe
//
// Para desativar: DELETE /api/push/subscribe + unsubscribe() local.

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(base64)
  // Aloca explicitamente um ArrayBuffer (nao SharedArrayBuffer) para satisfazer
  // o tipo BufferSource que applicationServerKey exige.
  const buffer = new ArrayBuffer(raw.length)
  const out = new Uint8Array(buffer)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return ""
  const bytes = new Uint8Array(buffer)
  let bin = ""
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  )
}

export function getPushPermissionState(): "default" | "granted" | "denied" {
  if (!isPushSupported()) return "default"
  return Notification.permission as "default" | "granted" | "denied"
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null
  const reg = await navigator.serviceWorker.getRegistration("/")
  return reg ?? null
}

async function fetchPublicKey(): Promise<string | null> {
  try {
    const res = await fetch("/api/push/public-key", { cache: "no-store" })
    if (!res.ok) return null
    const body = (await res.json()) as { publicKey?: string }
    return body.publicKey ?? null
  } catch {
    return null
  }
}

/**
 * Ativa push: pede permissao, cria PushSubscription e persiste no servidor.
 * Retorna o novo estado de permissao.
 */
export async function subscribeToPush(): Promise<
  "granted" | "denied" | "default" | "unsupported"
> {
  if (!isPushSupported()) return "unsupported"

  const permission = await Notification.requestPermission()
  if (permission !== "granted") return permission

  const reg = await getRegistration()
  if (!reg) return "default"

  const publicKey = await fetchPublicKey()
  if (!publicKey) {
    console.warn("[push] VAPID publica nao configurada no servidor")
    return "default"
  }

  // Se ja existe uma assinatura, reaproveita
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
    } catch (err) {
      console.warn("[push] subscribe falhou:", err)
      return "default"
    }
  }

  const payload = {
    endpoint: sub.endpoint,
    p256dh: arrayBufferToBase64(sub.getKey("p256dh")),
    auth: arrayBufferToBase64(sub.getKey("auth")),
    userAgent: navigator.userAgent,
  }

  try {
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      console.warn("[push] /api/push/subscribe respondeu", res.status)
    }
  } catch (err) {
    console.warn("[push] POST subscribe falhou:", err)
  }

  return "granted"
}

/**
 * Desativa push: remove no servidor + cancela a subscription local.
 */
export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return
  const reg = await getRegistration()
  if (!reg) return
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return

  try {
    await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    })
  } catch {
    /* segue o jogo */
  }
  await sub.unsubscribe().catch(() => undefined)
}
