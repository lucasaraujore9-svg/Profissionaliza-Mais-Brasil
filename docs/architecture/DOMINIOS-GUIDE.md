# Guia Tecnico: Multi-Tenant com Dominios na Vercel

## O Problema

O mesmo app Next.js responde a 4 tipos de URL, distribuidos em **dois dominios distintos**:

| Tipo | Exemplo | O que mostra |
|------|---------|-------------|
| Dominio do app (PMB) | `profissionalizamaisbrasil.com.br` | Site institucional + `/admin` + `/painel` + `/aluno` |
| Apex do dominio de vitrines | `livrecursos.com.br` | Landing de captacao de revendedores |
| Subdominio do dominio de vitrines | `joao.livrecursos.com.br` | Vitrine do revendedor "joao" |
| Dominio custom | `cursosjoao.com.br` | Vitrine do revendedor "joao" |

> Subdominios de `profissionalizamaisbrasil.com.br` (ex: `joao.profissionalizamaisbrasil.com.br`) **nunca** sao tenants — sao sempre reservados (`www`, `app`, `api`, ...). Isso isola o site institucional/admin do dominio onde vivem as vitrines, e os cookies de sessao ficam automaticamente segregados por dominio.

Em codigo, **sempre** use os helpers em `src/lib/tenant/urls.ts` (`appDomain`, `vitrineDomain`, `vitrineHost`, `vitrineUrl`, `cnameTarget`) em vez de concatenar strings.

## Solucao Completa

### 1. Configuracao DNS

**Registrar de `profissionalizamaisbrasil.com.br`:**
```
profissionalizamaisbrasil.com.br        A       76.76.21.21
www.profissionalizamaisbrasil.com.br    CNAME   cname.vercel-dns.com
```
Nao precisa wildcard aqui — subdominios nao sao usados como vitrine.

**Registrar de `livrecursos.com.br`:**
```
livrecursos.com.br                      A       76.76.21.21
www.livrecursos.com.br                  CNAME   cname.vercel-dns.com
*.livrecursos.com.br                    CNAME   cname.vercel-dns.com
```
O wildcard `*` aceita qualquer subdominio de vitrine.

### 2. Configuracao na Vercel

No painel Vercel > Settings > Domains, adicionar **todos**:

```
profissionalizamaisbrasil.com.br          (apex PMB)
www.profissionalizamaisbrasil.com.br      (www PMB)
livrecursos.com.br                        (apex livrecursos)
www.livrecursos.com.br                    (www livrecursos)
*.livrecursos.com.br                      (wildcard — vitrines)
```

A Vercel gera SSL automaticamente para todos.

### 3. Dominios Custom dos Revendedores

Quando um revendedor quer usar seu proprio dominio (ex: `cursosjoao.com.br`):

**Passo 1 — Revendedor configura DNS no dominio dele:**
```
cursosjoao.com.br       A       216.198.79.1
www.cursosjoao.com.br   CNAME   cname.livrecursos.com.br
```
O apex (`@`) usa um registro **A** porque CNAME no apex e proibido pela RFC do
DNS e o **Registro.br nao aceita nome vazio/@ em CNAME**. O IP e retornado por
`vercelApexIp()` (default `216.198.79.1`, IP apex recomendado atualmente pela
Vercel) e o `www` usa CNAME via `cnameTarget()` — ambos em
`src/lib/tenant/urls.ts`. O IP legado `76.76.21.21` continua roteando para a
Vercel, entao dominios ja apontados nele seguem funcionando.

**Passo 2 — Nosso sistema adiciona o dominio no projeto Vercel via API:**
```typescript
// src/lib/vercel/domains.ts

const VERCEL_TOKEN = process.env.VERCEL_TOKEN
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID

export async function addCustomDomain(domain: string) {
  const res = await fetch(
    `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/domains?teamId=${VERCEL_TEAM_ID}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${VERCEL_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: domain }),
    }
  )
  return res.json()
  // Retorna: { name, verified, verification: [...] }
}

export async function removeCustomDomain(domain: string) {
  const res = await fetch(
    `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/domains/${domain}?teamId=${VERCEL_TEAM_ID}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
    }
  )
  return res.json()
}

export async function checkDomainStatus(domain: string) {
  const res = await fetch(
    `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/domains/${domain}?teamId=${VERCEL_TEAM_ID}`,
    {
      headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
    }
  )
  return res.json()
  // verified: true/false, misconfigured: true/false
}

export async function verifyDomain(domain: string) {
  const res = await fetch(
    `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/domains/${domain}/verify?teamId=${VERCEL_TEAM_ID}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
    }
  )
  return res.json()
}
```

**Passo 3 — A Vercel verifica o DNS e gera SSL automaticamente.**

**Passo 4 — Fluxo no painel do revendedor:**
```
Revendedor digita dominio → POST /api/tenants/domain → addCustomDomain()
→ Vercel retorna status → Se verificado: salvar no banco → Mostrar instrucoes DNS
→ Botao "Verificar DNS" → checkDomainStatus() → Atualizar status
→ Quando verified=true: dominio ativo!
```

### 4. O Proxy (PECA CENTRAL)

Implementacao real em `src/proxy.ts`. O pseudocodigo abaixo descreve a logica — sempre prefira ler o codigo:

```typescript
// src/proxy.ts (resumo da logica)
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || 'profissionalizamaisbrasil.com.br'
const VITRINE_DOMAIN = process.env.NEXT_PUBLIC_VITRINE_DOMAIN || 'livrecursos.com.br'

// Subdominios que NAO sao tenants em VITRINE_DOMAIN
const RESERVED_SUBDOMAINS = new Set([
  'www', 'app', 'api', 'admin', 'painel', 'mail', 'smtp',
  'ftp', 'cdn', 'assets', 'static', 'staging', 'dev', 'test'
])

// Rotas publicas que nao precisam de tenant
const PUBLIC_PATHS = new Set([
  '/', '/login', '/register', '/forgot-password',
  '/seja-revendedor', '/sobre', '/api/webhooks'
])

export async function proxy(request: NextRequest) {
  const hostname = request.headers.get('host') || ''
  const cleanHost = hostname.replace(/:\d+$/, '').replace(/^www\./, '')
  const pathname = request.nextUrl.pathname

  // --- 1. APP_DOMAIN (PMB): site institucional + admin + painel ---
  // Subdominios aqui sao sempre reservados (RESERVED_SUBDOMAINS), nunca tenant.
  if (cleanHost === APP_DOMAIN || cleanHost.endsWith(`.${APP_DOMAIN}`)) {
    return NextResponse.next()
  }

  // --- 2. VITRINE_DOMAIN apex/www: landing dedicada (rewrite /livrecursos) ---
  if (cleanHost === VITRINE_DOMAIN) {
    const url = request.nextUrl.clone()
    url.pathname = pathname === '/' ? '/livrecursos' : `/livrecursos${pathname}`
    return NextResponse.rewrite(url)
  }

  // --- 3. VITRINE_DOMAIN subdominio: tenant ---
  if (cleanHost.endsWith(`.${VITRINE_DOMAIN}`)) {
    const subdomain = cleanHost.replace(`.${VITRINE_DOMAIN}`, '')

    // Subdominio reservado (ex: www.livrecursos.com.br) → landing
    if (RESERVED_SUBDOMAINS.has(subdomain)) {
      const url = request.nextUrl.clone()
      url.pathname = pathname === '/' ? '/livrecursos' : `/livrecursos${pathname}`
      return NextResponse.rewrite(url)
    }

    // Resolver tenant pelo slug (subdominio)
    const tenant = await resolveTenantBySlug(subdomain)

    if (!tenant) {
      return NextResponse.rewrite(new URL('/loja/not-found', request.url))
    }

    if (tenant.status !== 'active') {
      return NextResponse.rewrite(new URL('/loja/suspended', request.url))
    }

    const response = NextResponse.rewrite(
      new URL(`/loja${pathname === '/' ? '' : pathname}`, request.url)
    )
    response.headers.set('x-tenant-id', tenant.id)
    response.headers.set('x-tenant-slug', tenant.slug)
    return response
  }

  // --- 4. DOMINIO CUSTOM ---
  const tenant = await resolveTenantByDomain(cleanHost)

  if (!tenant) {
    // Dominio nao registrado no nosso sistema
    return NextResponse.rewrite(new URL('/loja/not-found', request.url))
  }

  if (tenant.status !== 'active') {
    return NextResponse.rewrite(new URL('/loja/suspended', request.url))
  }

  const response = NextResponse.rewrite(
    new URL(`/loja${pathname === '/' ? '' : pathname}`, request.url)
  )
  response.headers.set('x-tenant-id', tenant.id)
  response.headers.set('x-tenant-slug', tenant.slug)
  return response
}

// --- RESOLVER FUNCTIONS (com cache Redis) ---

async function resolveTenantBySlug(slug: string) {
  // 1. Checar cache Redis
  // const cached = await redis.get(`tenant:slug:${slug}`)
  // if (cached) return JSON.parse(cached)
  
  // 2. Query banco
  // const tenant = await prisma.tenant.findUnique({ where: { slug } })
  
  // 3. Salvar no cache (TTL 5 min)
  // await redis.set(`tenant:slug:${slug}`, JSON.stringify(tenant), { ex: 300 })
  
  // return tenant
}

async function resolveTenantByDomain(domain: string) {
  // 1. Checar cache Redis
  // const cached = await redis.get(`tenant:domain:${domain}`)
  // if (cached) return JSON.parse(cached)
  
  // 2. Query banco
  // const tenant = await prisma.tenant.findFirst({
  //   where: { customDomain: domain, domainVerified: true }
  // })
  
  // 3. Salvar no cache (TTL 5 min)
  // await redis.set(`tenant:domain:${domain}`, JSON.stringify(tenant), { ex: 300 })
  
  // return tenant
}

export const config = {
  matcher: [
    // Rodar middleware em tudo EXCETO assets estaticos e _next
    '/((?!_next/static|_next/image|favicon.ico|images/).*)',
  ],
}
```

### 5. IMPORTANTE: Middleware NAO pode usar Prisma diretamente

O middleware do Next.js roda no Edge Runtime, que NAO suporta Prisma diretamente. Solucoes:

**Opcao A — Fetch para API Route interna (simples):**
```typescript
async function resolveTenantBySlug(slug: string) {
  // Primeiro tenta cache Redis (Upstash funciona no Edge)
  const { Redis } = await import('@upstash/redis')
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  })
  
  const cached = await redis.get<TenantCache>(`tenant:slug:${slug}`)
  if (cached) return cached
  
  // Se nao tem cache, fetch API interna
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/tenants/resolve?slug=${slug}`, {
    headers: { 'x-internal-secret': process.env.INTERNAL_SECRET! }
  })
  
  if (!res.ok) return null
  const tenant = await res.json()
  
  // Cachear no Redis
  await redis.set(`tenant:slug:${slug}`, tenant, { ex: 300 })
  return tenant
}
```

**Opcao B — Supabase client direto no Edge (recomendada):**
```typescript
import { createClient } from '@supabase/supabase-js'

async function resolveTenantBySlug(slug: string) {
  // Redis primeiro
  const cached = await redis.get(`tenant:slug:${slug}`)
  if (cached) return cached
  
  // Supabase funciona no Edge (usa fetch, nao TCP)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  const { data } = await supabase
    .from('tenants')
    .select('id, slug, status, custom_domain, domain_verified')
    .eq('slug', slug)
    .single()
  
  if (data) {
    await redis.set(`tenant:slug:${slug}`, data, { ex: 300 })
  }
  
  return data
}
```

### 6. Como o Tenant Chega nos Components

Apos o middleware injetar `x-tenant-id` no header:

```typescript
// src/lib/tenant/context.ts
import { headers } from 'next/headers'

export async function getCurrentTenant() {
  const headersList = await headers()
  const tenantId = headersList.get('x-tenant-id')
  const tenantSlug = headersList.get('x-tenant-slug')
  
  if (!tenantId) return null
  
  // Buscar dados completos do tenant (com cache)
  const tenant = await getTenantById(tenantId)
  return tenant
}

// Uso em Server Components:
// const tenant = await getCurrentTenant()
// <LojaLayout tenant={tenant}>...</LojaLayout>
```

### 7. Fluxo Visual do Revendedor Configurando Dominio

```
PAINEL DO REVENDEDOR > CONFIGURACOES > DOMINIO

┌─────────────────────────────────────────────────┐
│ Seu Subdominio (automatico):                     │
│ [joao].livrecursos.com.br  ✅ Ativo               │
│                                                   │
│ ─────────────────────────────────────────────────│
│                                                   │
│ Dominio Proprio (opcional):                       │
│ [cursosjoao.com.br            ] [Adicionar]       │
│                                                   │
│ Status: ⏳ Aguardando verificacao DNS              │
│                                                   │
│ Configure o DNS do seu dominio:                   │
│ ┌──────────────────────────────────────────────┐  │
│ │ Tipo: A      Nome: @    Valor: 216.198.79.1   │  │
│ │ Tipo: CNAME  Nome: www  Valor:               │  │
│ │              cname.livrecursos.com.br         │  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│ [🔄 Verificar DNS]  [❌ Remover dominio]          │
└─────────────────────────────────────────────────┘
```

### 8. Desenvolvimento Local

`localhost` (sem subdominio) e tratado como app PMB. `{slug}.localhost` e tratado como tenant — conveniencia dev-only embutida em `src/proxy.ts`. Funciona out-of-the-box no Chrome/Edge (resolvem automaticamente).

Para testar a landing dedicada de `livrecursos.com.br` em dev, mapeie um host:

**Editar /etc/hosts:**
```
127.0.0.1   livrecursos.local
127.0.0.1   joao.livrecursos.local
127.0.0.1   maria.livrecursos.local
127.0.0.1   cursosjoao.local
```

**E definir no `.env.local`:**
```
NEXT_PUBLIC_VITRINE_DOMAIN=livrecursos.local
```

Acesse `http://livrecursos.local:3000` (landing) e `http://joao.livrecursos.local:3000` (vitrine do tenant joao).

### 9. Checklist de Deploy

- [ ] DNS de `profissionalizamaisbrasil.com.br` configurado (A + CNAME www)
- [ ] DNS de `livrecursos.com.br` configurado (A + CNAME www + CNAME wildcard)
- [ ] Vercel > Settings > Domains: ambos os apex, ambos os www, e `*.livrecursos.com.br`
- [ ] Env vars setadas: `NEXT_PUBLIC_APP_DOMAIN`, `NEXT_PUBLIC_VITRINE_DOMAIN`, `NEXT_PUBLIC_APP_URL`, `NEXTAUTH_URL`
- [ ] SSL gerado automaticamente pela Vercel (verificar todos)
- [ ] Vercel Token gerado e salvo nas env vars (gerencia custom domains dos revendedores)
- [ ] Vercel Project ID e Team ID salvos nas env vars
- [ ] Redis (Upstash) configurado e conectado
- [ ] Middleware testado com subdominio e dominio custom
- [ ] Paginas /loja/not-found e /loja/suspended criadas
- [ ] API /api/tenants/resolve criada (fallback do middleware)
