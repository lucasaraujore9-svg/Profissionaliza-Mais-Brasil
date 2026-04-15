import { NextRequest, NextResponse } from "next/server"

const APP_DOMAIN =
  process.env.NEXT_PUBLIC_APP_DOMAIN ?? "profissionalizamaisbrasil.com.br"

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
    // Redis não disponível, segue para fallback
  }
  return null
}

async function resolveTenantFromDB(
  identifier: string,
  type: "slug" | "domain"
): Promise<{ id: string; slug: string; status: string } | null> {
  const internalSecret = process.env.INTERNAL_SECRET
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://profissionalizamaisbrasil.com.br"

  try {
    const res = await fetch(
      `${appUrl}/api/internal/resolve-tenant?${type}=${encodeURIComponent(identifier)}`,
      {
        headers: {
          "x-internal-secret": internalSecret ?? "",
        },
      }
    )
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") ?? ""
  const { pathname } = request.nextUrl

  // Ignorar assets estáticos e APIs internas
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/internal") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.includes(".")
  ) {
    return NextResponse.next()
  }

  // Determinar se é o domínio principal
  const isMainDomain =
    hostname === APP_DOMAIN ||
    hostname === `www.${APP_DOMAIN}` ||
    hostname === "localhost:3000" ||
    hostname === "localhost"

  if (isMainDomain) {
    return NextResponse.next()
  }

  // Extrair subdomínio
  const subdomain = hostname.replace(`.${APP_DOMAIN}`, "").split(":")[0]
  const isSubdomain = hostname.endsWith(`.${APP_DOMAIN}`) || hostname.endsWith(`.localhost:3000`)

  let tenantSlug: string | null = null

  if (isSubdomain && subdomain && !RESERVED_SUBDOMAINS.has(subdomain)) {
    tenantSlug = subdomain
  }

  // Se não é subdomínio, pode ser domínio custom
  if (!tenantSlug) {
    const tenant = await resolveTenantFromDB(hostname.split(":")[0], "domain")
    if (tenant) {
      tenantSlug = tenant.slug
    }
  }

  // Se não resolveu nenhum tenant, 404
  if (!tenantSlug) {
    return NextResponse.next()
  }

  // Verificar se tenant existe e está ativo
  const cachedTenant = await resolveTenantFromRedis(tenantSlug)
  if (cachedTenant && cachedTenant.status !== "ACTIVE") {
    const url = request.nextUrl.clone()
    url.pathname = "/loja/suspended"
    return NextResponse.rewrite(url)
  }

  // Rewrite para /loja/* com headers do tenant propagados no request
  const url = request.nextUrl.clone()
  url.pathname = `/loja${pathname}`

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
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public directory)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
