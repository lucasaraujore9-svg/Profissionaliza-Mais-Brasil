// Profissionaliza Mais Brasil — Service Worker
// Estratégia:
//  - Páginas (navegação): network-first com fallback para /offline
//  - Assets estáticos (_next/static, /icons, /images): cache-first
//  - APIs e rotas dinâmicas: NUNCA cacheia (sempre online)
// Versionar via SW_VERSION quando publicar mudança que requer reset de cache.

const SW_VERSION = "v2"
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
