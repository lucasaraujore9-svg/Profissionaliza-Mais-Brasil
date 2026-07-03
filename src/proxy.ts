import { NextRequest, NextResponse } from "next/server"
import { isVitrinePath } from "@/lib/tenant/vitrine-paths"

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

// OBS-007: logging Edge-safe. O proxy roda no Edge runtime e NÃO pode importar
// Pino (`src/lib/logger.ts` usa APIs Node). Emitimos JSON estruturado via
// console.* — mesmo padrão de `src/lib/redis.ts`. NUNCA inclui PII: só host,
// slug, decisão/evento. Serve para diagnosticar roteamento multi-tenant (ex.: o
// incidente de fail-open do Redis que vazou a marca PMB nas vitrines).
function edgeLog(
  level: "warn" | "error",
  event: string,
  fields: Record<string, unknown>,
): void {
  const line = JSON.stringify({
    level,
    event,
    time: new Date().toISOString(),
    ...fields,
  })
  if (level === "error") console.error(line)
  else console.warn(line)
}

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

// Exportadas para unit-test (QA-016): funções puras e determinísticas de
// classificação de host — a barreira que impede um subdomínio reservado virar
// tenant e um host errado resolver a vitrine errada. Não têm efeito colateral.
export function isApexPassthrough(pathname: string): boolean {
  return VITRINE_APEX_PASSTHROUGH.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  )
}

export function stripPort(hostname: string): string {
  return hostname.split(":")[0]
}

export type HostKind = "app" | "vitrine_apex" | "tenant" | "unknown"

export interface HostInfo {
  kind: HostKind
  apex: string | null
  subdomain: string | null
}

export function matchApex(hostname: string, apex: string): HostInfo | null {
  if (hostname === apex || hostname === `www.${apex}`) {
    return { kind: "app", apex, subdomain: null }
  }
  if (hostname.endsWith(`.${apex}`)) {
    const sub = stripPort(hostname.slice(0, -1 * (apex.length + 1)))
    return { kind: "app", apex, subdomain: sub }
  }
  return null
}

export function classifyHost(hostname: string): HostInfo {
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
  slug: string,
  host: string,
): Promise<{ id: string; status: string } | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) return null

  try {
    // Chave alinhada a `tenantBySlugKey` (src/lib/redis/keys.ts) — o cache
    // (setTenant no resolve-tenant) grava em `tenant:slug:{slug}`. Antes o proxy
    // lia `tenant:{slug}` (ninguém grava) → 100% cache-miss (PERF-001). O contrato
    // do formato da chave é travado por teste em src/lib/redis/keys.test.ts.
    const res = await fetch(
      `${url.replace(/\/$/, "")}/get/tenant:slug:${encodeURIComponent(slug)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    const data = await res.json()
    if (data.result) {
      return JSON.parse(data.result)
    }
  } catch {
    // Redis indisponível: fail-open (o fallback de DB abaixo assume). Antes era
    // um catch mudo — sem rastro do incidente que fez o proxy servir a marca PMB
    // sob a vitrine da revenda. Log Edge-safe, sem PII.
    edgeLog("warn", "proxy.tenant.failopen", { host, slug, source: "redis" })
  }
  return null
}

// Le o redirect de um subdominio antigo -> slug atual (gravado no rename, key
// `tenant:redirect:{slug}` com TTL de 15 dias). Retorna o slug novo ou null.
async function resolveRedirectFromRedis(
  slug: string,
  host: string,
): Promise<string | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null

  try {
    const res = await fetch(
      `${url.replace(/\/$/, "")}/get/tenant:redirect:${encodeURIComponent(slug)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const data = await res.json()
    if (data.result) {
      const parsed = JSON.parse(data.result)
      return typeof parsed === "string" ? parsed : null
    }
  } catch {
    // Redis indisponível, segue (fallback de DB cobre os caminhos de vitrine).
    edgeLog("warn", "proxy.redirect.redis_failed", { host, slug, source: "redis" })
  }
  return null
}

type TenantRecord = { id: string; slug: string; status: string }

// Discrimina "tenant nao existe" (404 definitivo) de "falha transitoria"
// (secret ausente, rede, 5xx). O proxy usa essa distincao para, num custom
// domain desconhecido, dar 404 SO quando temos certeza que o dominio nao
// pertence a nenhuma revenda — e manter fail-open (servir normalmente) em
// falhas transitorias, para nao derrubar uma vitrine valida por um soluco.
type ResolveResult =
  | { ok: true; tenant: TenantRecord }
  | { ok: true; redirectSlug: string }
  | { ok: false; reason: "not_found" | "error" }

async function resolveTenantFromDB(
  identifier: string,
  type: "slug" | "domain",
  origin: string
): Promise<ResolveResult> {
  const internalSecret = process.env.INTERNAL_SECRET
  if (!internalSecret) return { ok: false, reason: "error" }

  try {
    const res = await fetch(
      `${origin}/api/internal/resolve-tenant?${type}=${encodeURIComponent(identifier)}`,
      {
        headers: { "x-internal-secret": internalSecret },
      }
    )
    if (res.status === 404) return { ok: false, reason: "not_found" }
    if (!res.ok) return { ok: false, reason: "error" }
    const json = (await res.json()) as TenantRecord & { redirectSlug?: string }
    // Slug antigo (renomeado): o endpoint devolve o slug atual para redirect.
    if (json.redirectSlug) return { ok: true, redirectSlug: json.redirectSlug }
    return { ok: true, tenant: json }
  } catch {
    // Fallback de DB (resolve-tenant) indisponível: fail-open. Antes mudo — sem
    // rastro quando o roteamento multi-tenant degradava.
    edgeLog("error", "proxy.tenant.db_failopen", { identifier, type, source: "db" })
    return { ok: false, reason: "error" }
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
  // Vira true quando um host externo (custom domain) foi confirmado como NAO
  // pertencente a nenhuma revenda. Nesse caso nao podemos servir o site PMB sob
  // o dominio da revenda (vazaria vitrine/pagamentos da marca master).
  let customDomainNotFound = false

  // Helper: 308 para o subdominio novo, preservando path + querystring.
  function redirectToSlug(newSlug: string): NextResponse {
    const url = request.nextUrl.clone()
    url.hostname = host.apex ? `${newSlug}.${host.apex}` : url.hostname
    return NextResponse.redirect(url, 308)
  }

  if (host.kind === "tenant" && host.subdomain) {
    tenantSlug = host.subdomain

    // Subdominio antigo (renomeado nos ultimos 15 dias): 308 para o slug atual
    // da unidade. Fonte primaria = Redis (gravado no rename); o fallback de DB
    // mais abaixo cobre os caminhos de vitrine caso a chave tenha sido evictada.
    const redirectTo = await resolveRedirectFromRedis(tenantSlug, hostname)
    if (redirectTo && redirectTo !== tenantSlug && host.apex) {
      return redirectToSlug(redirectTo)
    }
  }

  // Hostname desconhecido: tenta resolver como custom domain de tenant.
  if (host.kind === "unknown") {
    const result = await resolveTenantFromDB(stripPort(hostname), "domain", origin)
    if (result.ok && "tenant" in result) {
      tenantSlug = result.tenant.slug
    } else if (!result.ok && result.reason === "not_found") {
      customDomainNotFound = true
    }
    // reason === "error" (transitorio): segue o fluxo de fail-open abaixo.
  }

  if (!tenantSlug) {
    // Custom domain externo apontado para nos, mas que nao corresponde a
    // nenhuma revenda: retornamos 404 em vez de cair no site PMB. Servir o PMB
    // aqui faria a vitrine (e os pagamentos) da marca master aparecerem sob o
    // dominio da revenda — exatamente o bug que motivou esta correcao. Deploy
    // URLs (*.vercel.app) e demais hosts internos continuam passando.
    if (customDomainNotFound) {
      edgeLog("warn", "proxy.custom_domain.not_found", { host: stripPort(hostname) })
      return new NextResponse(
        "Domínio não configurado. Verifique o apontamento de DNS desta loja.",
        { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } }
      )
    }
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

  // Resolve o status do tenant. Preferimos o cache (Edge), mas em cache-miss
  // caimos no banco — caso contrario uma vitrine PENDING (sem 1o pagamento) ou
  // SUSPENDED (inadimplente) que ainda nao esta no cache venderia normalmente.
  let resolvedTenant = await resolveTenantFromRedis(tenantSlug, hostname)
  if (!resolvedTenant) {
    const dbResult = await resolveTenantFromDB(tenantSlug, "slug", origin)
    if (dbResult.ok && "redirectSlug" in dbResult) {
      // Slug antigo (Redis evictado): 308 para o slug atual via fonte de verdade.
      if (dbResult.redirectSlug !== tenantSlug && host.apex) {
        return redirectToSlug(dbResult.redirectSlug)
      }
    } else if (dbResult.ok && "tenant" in dbResult) {
      resolvedTenant = { id: dbResult.tenant.id, status: dbResult.tenant.status }
    }
  }

  // Qualquer estado != ACTIVE (PENDING, SUSPENDED, CANCELLED) bloqueia a venda.
  // A pagina /loja/suspended diferencia a mensagem pelo status (e 404 p/ CANCELLED).
  if (resolvedTenant && resolvedTenant.status !== "ACTIVE") {
    const url = request.nextUrl.clone()
    url.pathname = "/loja/suspended"
    const blockedHeaders = new Headers(sanitizedHeaders)
    blockedHeaders.set("x-tenant-slug", tenantSlug)
    return NextResponse.rewrite(url, {
      request: { headers: blockedHeaders },
    })
  }

  const url = request.nextUrl.clone()
  url.pathname = pathname === "/" ? "/loja" : `/loja${pathname}`

  const requestHeaders = new Headers(sanitizedHeaders)
  requestHeaders.set("x-tenant-slug", tenantSlug)
  if (resolvedTenant) {
    requestHeaders.set("x-tenant-id", resolvedTenant.id)
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
