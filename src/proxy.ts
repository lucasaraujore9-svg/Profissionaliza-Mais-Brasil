import { NextRequest, NextResponse } from "next/server"

// ============================================================
// Arquitetura de dominios (multi-tenant)
//
//   profissionalizamaisbrasil.com.br      → site PMB (institucional + admin + painel)
//   www.profissionalizamaisbrasil.com.br  → site PMB
//   livrecursos.com.br                    → landing dedicada a captacao de revendedores
//   www.livrecursos.com.br                → mesma landing
//   {slug}.livrecursos.com.br             → vitrine do revendedor (rewrite p/ /loja)
//   {customDomain}                        → vitrine do revendedor (lookup via DB)
//
// Subdominios em PMB NAO sao tenants (so reservados como www, app, api, ...).
// ============================================================

const PRIMARY_APP_DOMAIN = "profissionalizamaisbrasil.com.br"
const PRIMARY_VITRINE_DOMAIN = "livrecursos.com.br"

const APP_DOMAINS = Array.from(
  new Set(
    [process.env.NEXT_PUBLIC_APP_DOMAIN, PRIMARY_APP_DOMAIN].filter(
      (d): d is string => Boolean(d)
    )
  )
)

const VITRINE_DOMAINS = Array.from(
  new Set(
    [process.env.NEXT_PUBLIC_VITRINE_DOMAIN, PRIMARY_VITRINE_DOMAIN].filter(
      (d): d is string => Boolean(d)
    )
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
// Tudo fora dessa lista (ex: /admin, /painel, /login, /sobre)
// passa direto e usa as rotas do site principal.
const VITRINE_PATH_PREFIXES = ["/curso", "/checkout", "/confirmacao", "/contato", "/pagar"]

function isVitrinePath(pathname: string): boolean {
  if (pathname === "/") return true
  // "/cursos" (catalogo "todos os cursos") é servido pela vitrine (/loja/cursos),
  // com cabeçalho/rodapé e catálogo/preços da unidade. O detalhe continua em
  // "/curso/:slug" (singular, já coberto por VITRINE_PATH_PREFIXES); por isso
  // casamos "/cursos" exato e NÃO o prefixo "/cursos/" (evita 404 em /loja/cursos/x).
  if (pathname === "/cursos") return true
  return VITRINE_PATH_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  )
}

// Paths servidos DIRETO no apex da vitrine (livrecursos.com.br / www), sem
// rewrite para /livrecursos: paginas de captacao de revendedor + APIs publicas
// que elas consomem (validacao/captura de ref, leads) + validacao de
// certificado. O link de indicacao (`/seja-revendedor?ref=CODE`) gerado no
// painel aponta exatamente para este dominio — sem o pass-through ele caia em
// /livrecursos/seja-revendedor (404).
const VITRINE_APEX_PASSTHROUGH = [
  "/seja-revendedor",
  "/contrato-de-revenda",
  "/validar",
  "/api",
]

function isApexPassthrough(pathname: string): boolean {
  return VITRINE_APEX_PASSTHROUGH.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  )
}

function stripPort(hostname: string): string {
  return hostname.split(":")[0]
}

type HostKind = "app" | "vitrine_apex" | "tenant" | "unknown"

interface HostInfo {
  kind: HostKind
  apex: string | null
  subdomain: string | null
}

function matchApex(hostname: string, apex: string): HostInfo | null {
  if (hostname === apex || hostname === `www.${apex}`) {
    return { kind: "app", apex, subdomain: null }
  }
  if (hostname.endsWith(`.${apex}`)) {
    const sub = stripPort(hostname.slice(0, -1 * (apex.length + 1)))
    return { kind: "app", apex, subdomain: sub }
  }
  return null
}

function classifyHost(hostname: string): HostInfo {
  // 1) App domain (site PMB) — subdominios aqui sao sempre reservados,
  //    NUNCA tenants. Isso isola o site institucional/admin de vitrines.
  for (const apex of APP_DOMAINS) {
    const hit = matchApex(hostname, apex)
    if (hit) return hit
  }

  // 2) Vitrine domain — apex sao landing dedicada; subdominios viram tenants
  //    (a menos que estejam em RESERVED_SUBDOMAINS).
  for (const apex of VITRINE_DOMAINS) {
    if (hostname === apex || hostname === `www.${apex}`) {
      return { kind: "vitrine_apex", apex, subdomain: null }
    }
    if (hostname.endsWith(`.${apex}`)) {
      const sub = stripPort(hostname.slice(0, -1 * (apex.length + 1)))
      if (RESERVED_SUBDOMAINS.has(sub)) {
        return { kind: "vitrine_apex", apex, subdomain: sub }
      }
      return { kind: "tenant", apex, subdomain: sub }
    }
  }

  // 3) Dev local: `localhost` ou `localhost:PORT` → trata como app principal.
  //    `{slug}.localhost[:PORT]` → trata como tenant (conveniencia dev-only).
  //    Para testar a landing de livrecursos em dev, defina
  //    NEXT_PUBLIC_VITRINE_DOMAIN no .env.local (ex: livrecursos.local) e
  //    aponte no /etc/hosts.
  const bare = stripPort(hostname)
  if (bare === "localhost") {
    return { kind: "app", apex: hostname, subdomain: null }
  }
  if (bare.endsWith(".localhost")) {
    const sub = bare.slice(0, -1 * ".localhost".length)
    if (RESERVED_SUBDOMAINS.has(sub)) {
      return { kind: "app", apex: hostname, subdomain: sub }
    }
    return { kind: "tenant", apex: hostname, subdomain: sub }
  }

  return { kind: "unknown", apex: null, subdomain: null }
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

  // Sempre remove headers de tenant que possam ter sido injetados pelo cliente
  // antes de classificar o host. Eles só voltam a ser setados pelo proxy
  // quando o host é efetivamente um tenant resolvido (subdomínio ou custom domain).
  const sanitizedHeaders = new Headers(request.headers)
  sanitizedHeaders.delete("x-tenant-id")
  sanitizedHeaders.delete("x-tenant-slug")

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/internal") ||
    pathname.startsWith("/favicon.ico") ||
    /\.(?:ico|png|jpg|jpeg|gif|webp|svg|css|js|map|txt|xml|woff2?|ttf|eot|json)$/i.test(pathname)
  ) {
    return NextResponse.next({ request: { headers: sanitizedHeaders } })
  }

  const host = classifyHost(hostname)

  // Apex da vitrine (livrecursos.com.br/, www.livrecursos.com.br/, ou subdominios
  // reservados como www): renderiza a landing dedicada de captacao em /livrecursos.
  if (host.kind === "vitrine_apex") {
    // Rotas publicas servidas direto no dominio da vitrine (sem rewrite):
    // captacao de revendedor (/seja-revendedor, /contrato-de-revenda),
    // validacao de certificado (/validar — QR aponta p/ www.livrecursos.com.br)
    // e as APIs publicas consumidas por elas (/api/*).
    if (isApexPassthrough(pathname)) {
      return NextResponse.next({ request: { headers: sanitizedHeaders } })
    }

    const url = request.nextUrl.clone()
    url.pathname = pathname === "/" ? "/livrecursos" : `/livrecursos${pathname}`
    return NextResponse.rewrite(url, {
      request: { headers: sanitizedHeaders },
    })
  }

  let tenantSlug: string | null = null

  if (host.kind === "tenant" && host.subdomain) {
    tenantSlug = host.subdomain
  }

  // Hostname desconhecido: tenta resolver como custom domain de tenant.
  if (host.kind === "unknown") {
    const tenant = await resolveTenantFromDB(
      stripPort(hostname),
      "domain",
      origin
    )
    if (tenant) {
      tenantSlug = tenant.slug
    }
  }

  if (!tenantSlug) {
    return NextResponse.next({ request: { headers: sanitizedHeaders } })
  }

  // Em subdomínio de tenant, só reescreve para /loja se for caminho de vitrine.
  // /admin, /painel, /login, /api, /sobre etc. ficam servidos pelo site
  // principal sem rewrite (mas com cabeçalho/rodapé da unidade — o layout
  // (main) é tenant-aware via getCurrentTenant).
  if (!isVitrinePath(pathname)) {
    const requestHeaders = new Headers(sanitizedHeaders)
    requestHeaders.set("x-tenant-slug", tenantSlug)
    return NextResponse.next({
      request: { headers: requestHeaders },
    })
  }

  const cachedTenant = await resolveTenantFromRedis(tenantSlug)
  if (cachedTenant && cachedTenant.status !== "ACTIVE") {
    const url = request.nextUrl.clone()
    url.pathname = "/loja/suspended"
    return NextResponse.rewrite(url, {
      request: { headers: sanitizedHeaders },
    })
  }

  const url = request.nextUrl.clone()
  url.pathname = pathname === "/" ? "/loja" : `/loja${pathname}`

  const requestHeaders = new Headers(sanitizedHeaders)
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
