// Profissionaliza Mais Brasil — Service Worker
// Estratégia:
//  - Páginas (navegação): network-first com fallback para /offline
//  - Assets estáticos (_next/static, /icons, /images): cache-first
//  - APIs e rotas dinâmicas: NUNCA cacheia (sempre online)
// Versionar via SW_VERSION quando publicar mudança que requer reset de cache.

const SW_VERSION = "v3"
const STATIC_CACHE = `pmb-static-${SW_VERSION}`
const PAGES_CACHE = `pmb-pages-${SW_VERSION}`

const PRECACHE_URLS = [
  "/offline",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.endsWith(SW_VERSION))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/images/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/favicon.ico" ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".woff2") ||
    url.pathname.endsWith(".woff")
  )
}

function isApiOrAuth(url) {
  return (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/data/")
  )
}

function isHtmlNavigation(request) {
  return (
    request.mode === "navigate" ||
    (request.method === "GET" &&
      request.headers.get("accept")?.includes("text/html"))
  )
}

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return

  const url = new URL(request.url)

  // Mesmo origin only — terceiros (Asaas, MP) passam direto
  if (url.origin !== self.location.origin) return

  // APIs nunca cacheiam
  if (isApiOrAuth(url)) return

  // Static assets: cache-first
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone()
              caches
                .open(STATIC_CACHE)
                .then((cache) => cache.put(request, clone))
            }
            return response
          })
          .catch(() => cached)
      }),
    )
    return
  }

  // HTML: network-first com fallback para /offline
  if (isHtmlNavigation(request)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches
              .open(PAGES_CACHE)
              .then((cache) => cache.put(request, clone))
          }
          return response
        })
        .catch(() =>
          caches
            .match(request)
            .then(
              (cached) =>
                cached ?? caches.match("/offline"),
            ),
        ),
    )
    return
  }
})

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting()
})

// ============================================================
// Web Push — recebe payload JSON do servidor (web-push) e mostra notificacao
// Payload esperado: { title, body, href, level, category, tag, notificationId }
// ============================================================

self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    // payload nao-JSON: usa como texto bruto
    data = { title: "Profissionaliza Mais Brasil", body: event.data?.text?.() ?? "" }
  }

  const title = data.title || "Profissionaliza Mais Brasil"
  const body = data.body || ""
  const href = data.href || "/"
  const tag = data.tag || "pmb-notif"

  const options = {
    body,
    tag,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: {
      href,
      notificationId: data.notificationId || null,
      level: data.level || "INFO",
      category: data.category || null,
    },
    // Vibra so em mobile que suporta — desktop ignora
    vibrate: [80, 40, 80],
    // Como a `tag` agrupa por categoria, uma nova notificacao substitui a
    // anterior de mesma categoria. renotify=true garante que essa substituicao
    // ainda alerte (som/vibracao) — senao eventos distintos (ex: 2 mensalidades)
    // seriam trocados silenciosamente e passariam despercebidos.
    renotify: true,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  const targetHref = data.href || "/"
  const notificationId = data.notificationId

  event.waitUntil(
    (async () => {
      // 1. Marca como lida (best-effort)
      if (notificationId) {
        try {
          await fetch(`/api/notifications/${notificationId}/read`, {
            method: "POST",
            credentials: "include",
            keepalive: true,
          })
        } catch {
          /* segue */
        }
      }

      // 2. Foca janela existente ou abre nova
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      })

      // Procura uma aba ja em qualquer pagina do app
      for (const client of allClients) {
        try {
          await client.focus()
          if ("navigate" in client) {
            await client.navigate(targetHref)
          }
          return
        } catch {
          /* tenta a proxima */
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(targetHref)
      }
    })(),
  )
})

// Quando uma subscription expira, o browser dispara isto. Reassinamos
// silenciosamente — o /api/push/subscribe e idempotente.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const res = await fetch("/api/push/public-key", { credentials: "include" })
        if (!res.ok) return
        const { publicKey } = await res.json()
        if (!publicKey) return

        const newSub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        })

        const p256dh = bufToBase64(newSub.getKey("p256dh"))
        const auth = bufToBase64(newSub.getKey("auth"))

        await fetch("/api/push/subscribe", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            endpoint: newSub.endpoint,
            p256dh,
            auth,
          }),
        })
      } catch {
        // sem console.warn aqui — SW pode nao ter contexto bom
      }
    })(),
  )
})

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function bufToBase64(buf) {
  if (!buf) return ""
  const bytes = new Uint8Array(buf)
  let bin = ""
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}
