import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { apexDomain, wwwDomain } from "@/lib/tenant/urls"
import { isInternalAuthorized } from "@/lib/auth/bearer"
import { rateLimit, rateLimitResponse } from "@/lib/ratelimit"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"

// Validações server-side de slug e custom domain.
// Slug: mesmo regex do Tenant.slug — letras minúsculas, números, hífen e underscore.
// Domain: hostname FQDN básico (até 253 chars, labels alfanuméricos).
const SLUG_RE = /^[a-z0-9_-]{1,64}$/
const DOMAIN_RE =
  /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i

export const GET = withRequestContext(
  { action: "internal.resolve_tenant", route: "/api/internal/resolve-tenant" },
  async (request: Request) => {
  // Rate-limit defense-in-depth: mesmo que o secret seja conhecido, bot
  // não consegue varrer slugs/domains do banco em massa.
  // failOpen: resolucao de tenant e infra CRITICA do proxy (custom domain ->
  // revenda). Um outage do Upstash (ex.: cota mensal estourada) NAO pode
  // bloquear este endpoint — senao o proxy cai em fail-open e serve a PMB sob o
  // dominio da revenda (personalizacao "sumida"). O x-internal-secret ja protege
  // contra chamadas externas; o rate-limit aqui e so defesa-em-profundidade.
  const rl = await rateLimit(request, {
    name: "internal-resolve",
    limit: 60,
    windowSec: 60,
    failOpen: true,
  })
  if (!rl.ok) return rateLimitResponse(rl)

  if (!isInternalAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const slug = searchParams.get("slug")?.toLowerCase().trim() || null
  const domain = searchParams.get("domain")?.toLowerCase().trim() || null

  if (!slug && !domain) {
    return NextResponse.json({ error: "missing param" }, { status: 400 })
  }
  if (slug && !SLUG_RE.test(slug)) {
    return NextResponse.json({ error: "invalid slug" }, { status: 400 })
  }
  if (domain && !DOMAIN_RE.test(domain)) {
    return NextResponse.json({ error: "invalid domain" }, { status: 400 })
  }

  try {
    // Resolve por custom domain SEM exigir `domainVerified`. A requisicao so
    // chega aqui com Host = custom domain se a Vercel ja estiver entregando
    // trafego para esse dominio — o que exige o dominio anexado ao projeto +
    // DNS apontando + verificacao no nivel da plataforma. Ou seja, a chegada do
    // Host ja prova a posse; a flag `domainVerified` no banco e apenas um
    // indicador de UI (e dependia de um passo manual de "verificar" no painel).
    // Exigir `domainVerified=true` aqui derrubava a resolucao de dominios que ja
    // funcionavam (flag dessincronizada), fazendo o proxy cair no site PMB e
    // servir a vitrine/pagamentos da marca master no lugar da revenda.
    // O `@unique` em customDomain garante que dois tenants nao reivindiquem o
    // mesmo dominio, entao resolver so por customDomain e seguro.
    //
    // Suporte a `www` e apex: o domain canonico e armazenado na forma apex, mas
    // o visitante pode chegar pelo host com ou sem `www.`. Casamos contra as duas
    // variantes (e o valor cru) para resolver ambas para o mesmo tenant.
    const domainCandidates = domain
      ? Array.from(new Set([domain, apexDomain(domain), wwwDomain(domain)]))
      : []
    const tenant = await prisma.tenant.findFirst({
      where: slug ? { slug } : { customDomain: { in: domainCandidates } },
      select: { id: true, slug: true, status: true },
    })

    if (!tenant) {
      // Slug antigo de uma revenda renomeada: enquanto a reserva (15 dias) nao
      // expira, devolvemos o slug ATUAL da unidade para o proxy emitir 308.
      // (So vale para lookup por slug — custom domains nunca caem aqui.)
      if (slug) {
        const redirect = await prisma.tenantSlugRedirect.findFirst({
          where: { oldSlug: slug, expiresAt: { gt: new Date() } },
          select: { tenant: { select: { slug: true } } },
        })
        if (redirect) {
          return NextResponse.json({ redirectSlug: redirect.tenant.slug })
        }
      }
      return NextResponse.json({ error: "not found" }, { status: 404 })
    }

    return NextResponse.json(tenant)
  } catch (error) {
    contextLogger().error(
      { err: error, event: "internal.resolve_tenant.failed" },
      "resolve-tenant interno falhou",
    )
    return NextResponse.json({ error: "internal error" }, { status: 500 })
  }
  },
)
