import { NextRequest, NextResponse } from "next/server"

const PRIMARY_APP_DOMAIN = "profissionalizamaisbrasil.com.br"

const APP_DOMAINS = Array.from(
  new Set(
    [
      process.env.NEXT_PUBLIC_APP_DOMAIN,
      PRIMARY_APP_DOMAIN,
      "localhost:3000",
      "localhost:3002",
      "localhost",
    ].filter((d): d is string => Boolean(d))
  )
)

const RESERVED_SUBDOMAINS = new Set([
  "www",
  "app",
  "api",
  "admin",
  "painel",
  "mail",
  "smtp",
  "ftp",
  "cdn",
  "assets",
  "static",
  "staging",
  "dev",
  "test",
])

// Rotas que devem ser reescritas para /loja em subdomínios de tenant.
// Tudo fora dessa lista (ex: /admin, /painel, /login, /cursos, /sobre)
// passa direto e usa as rotas do site principal.
const VITRINE_PATH_PREFIXES = ["/curso", "/checkout", "/confirmacao"]

function isVitrinePath(pathname: string): boolean {
  if (pathname === "/") return true
  return VITRINE_PATH_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  )
}

function detectSubdomain(hostname: string): {
  subdomain: string | null
  apex: string | null
} {
  for (const apex of APP_DOMAINS) {
    if (hostname === apex || hostname === `www.${apex}`) {
      return { subdomain: null, apex }
    }
    if (hostname.endsWith(`.${apex}`)) {
      const sub = hostname.slice(0, -1 * (apex.length + 1)).split(":")[0]
      return { subdomain: sub, apex }
    }
  }
  return { subdomain: null, apex: null }
}

async function resolveTenantFromRedis(
  slug: string
): Promise<{ id: string; status: string } | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) return null

  try {
    const res = await fetch(`${url}/get/tenant:${slug}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    if (data.result) {
      return JSON.parse(data.result)
    }
  } catch {
    // Redis indisponível, segue
  }
  return null
}

async function resolveTenantFromDB(
  identifier: string,
  type: "slug" | "domain",
  origin: string
): Promise<{ id: string; slug: string; status: string } | null> {
  const internalSecret = process.env.INTERNAL_SECRET
  if (!internalSecret) return null

  try {
    const res = await fetch(
      `${origin}/api/internal/resolve-tenant?${type}=${encodeURIComponent(identifier)}`,
      {
        headers: { "x-internal-secret": internalSecret },
      }
    )
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export default async function proxy(request: NextRequest) {
  const hostname = request.headers.get("host") ?? ""
  const { pathname, origin } = request.nextUrl

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/internal") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.includes(".")
  ) {
    return NextResponse.next()
  }

  const { subdomain } = detectSubdomain(hostname)

  let tenantSlug: string | null = null

  if (subdomain && !RESERVED_SUBDOMAINS.has(subdomain)) {
    tenantSlug = subdomain
  }

  if (!tenantSlug) {
    const knownApex = APP_DOMAINS.some(
      (apex) => hostname === apex || hostname === `www.${apex}`
    )
    if (!knownApex) {
      const tenant = await resolveTenantFromDB(
        hostname.split(":")[0],
        "domain",
        origin
      )
      if (tenant) {
        tenantSlug = tenant.slug
      }
    }
  }

  if (!tenantSlug) {
    return NextResponse.next()
  }

  // Em subdomínio de tenant, só reescreve para /loja se for caminho de vitrine.
  // /admin, /painel, /login, /api, /cursos, /sobre etc. ficam servidos pelo
  // site principal sem rewrite.
  if (!isVitrinePath(pathname)) {
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set("x-tenant-slug", tenantSlug)
    return NextResponse.next({
      request: { headers: requestHeaders },
    })
  }

  const cachedTenant = await resolveTenantFromRedis(tenantSlug)
  if (cachedTenant && cachedTenant.status !== "ACTIVE") {
    const url = request.nextUrl.clone()
    url.pathname = "/loja/suspended"
    return NextResponse.rewrite(url)
  }

  const url = request.nextUrl.clone()
  url.pathname = pathname === "/" ? "/loja" : `/loja${pathname}`

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-tenant-slug", tenantSlug)
  if (cachedTenant) {
    requestHeaders.set("x-tenant-id", cachedTenant.id)
  }

  return NextResponse.rewrite(url, {
    request: { headers: requestHeaders },
  })
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
