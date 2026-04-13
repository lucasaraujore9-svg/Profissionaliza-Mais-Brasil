# Guia Tecnico: Multi-Tenant com Dominios na Vercel

## O Problema

Precisamos que o mesmo app Next.js responda a 3 tipos de URL:

| Tipo | Exemplo | O que mostra |
|------|---------|-------------|
| Dominio principal | `profissionalizamaisbrasil.com.br` | Site institucional, login, admin |
| Subdominio | `joao.profissionalizamaisbrasil.com.br` | Vitrine do revendedor "joao" |
| Dominio custom | `cursosjoao.com.br` | Vitrine do revendedor "joao" |

## Solucao Completa

### 1. Configuracao DNS do Dominio Principal

No registrador do dominio (Registro.br ou onde estiver):

```
profissionalizamaisbrasil.com.br    A       76.76.21.21
*.profissionalizamaisbrasil.com.br  CNAME   cname.vercel-dns.com
```

O registro wildcard `*` faz com que qualquer subdominio aponte para a Vercel.

### 2. Configuracao na Vercel

No painel da Vercel > Settings > Domains, adicionar:

```
profissionalizamaisbrasil.com.br          (dominio principal)
*.profissionalizamaisbrasil.com.br        (wildcard - aceita qualquer sub)
```

A Vercel gera SSL automaticamente para ambos.

### 3. Dominios Custom dos Revendedores

Quando um revendedor quer usar seu proprio dominio (ex: `cursosjoao.com.br`):

**Passo 1 — Revendedor configura DNS no dominio dele:**
```
cursosjoao.com.br   CNAME   cname.vercel-dns.com
```

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

### 4. O Middleware (PECA CENTRAL)

```typescript
// src/middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || 'profissionalizamaisbrasil.com.br'

// Subdominios que NAO sao tenants
const RESERVED_SUBDOMAINS = new Set([
  'www', 'app', 'api', 'admin', 'painel', 'mail', 'smtp',
  'ftp', 'cdn', 'assets', 'static', 'staging', 'dev', 'test'
])

// Rotas publicas que nao precisam de tenant
const PUBLIC_PATHS = new Set([
  '/', '/login', '/register', '/forgot-password',
  '/seja-revendedor', '/sobre', '/api/webhooks'
])

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || ''
  const cleanHost = hostname.replace(/:\d+$/, '').replace(/^www\./, '')
  const pathname = request.nextUrl.pathname

  // --- 1. DOMINIO PRINCIPAL ---
  if (cleanHost === APP_DOMAIN) {
    // Site principal: nao faz nada, segue normal
    return NextResponse.next()
  }

  // --- 2. SUBDOMINIO ---
  if (cleanHost.endsWith(`.${APP_DOMAIN}`)) {
    const subdomain = cleanHost.replace(`.${APP_DOMAIN}`, '')

    // Subdominio reservado? (ex: api.profissionalizamaisbrasil.com.br)
    if (RESERVED_SUBDOMAINS.has(subdomain)) {
      return NextResponse.next()
    }

    // Resolver tenant pelo slug (subdominio)
    const tenant = await resolveTenantBySlug(subdomain)

    if (!tenant) {
      // Subdominio nao existe → pagina 404 ou redirect
      return NextResponse.rewrite(new URL('/loja/not-found', request.url))
    }

    if (tenant.status !== 'active') {
      // Tenant suspenso/cancelado
      return NextResponse.rewrite(new URL('/loja/suspended', request.url))
    }

    // Injetar tenant nos headers e reescrever para /loja/*
    const response = NextResponse.rewrite(
      new URL(`/loja${pathname === '/' ? '' : pathname}`, request.url)
    )
    response.headers.set('x-tenant-id', tenant.id)
    response.headers.set('x-tenant-slug', tenant.slug)
    return response
  }

  // --- 3. DOMINIO CUSTOM ---
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
│ [joao].profissionalizamaisbrasil.com.br  ✅ Ativo │
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
│ │ Tipo: CNAME                                   │  │
│ │ Nome: @ (ou cursosjoao.com.br)               │  │
│ │ Valor: cname.vercel-dns.com                  │  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│ [🔄 Verificar DNS]  [❌ Remover dominio]          │
└─────────────────────────────────────────────────┘
```

### 8. Desenvolvimento Local

Para testar multi-tenant localmente:

**Editar /etc/hosts:**
```
127.0.0.1   profissionalizamaisbrasil.local
127.0.0.1   joao.profissionalizamaisbrasil.local
127.0.0.1   maria.profissionalizamaisbrasil.local
127.0.0.1   cursosjoao.local
```

**Ou usar o middleware com deteccao de dev:**
```typescript
// Em dev, aceitar .local e localhost
const isLocalDev = process.env.NODE_ENV === 'development'
const APP_DOMAIN = isLocalDev 
  ? 'profissionalizamaisbrasil.local:3000'
  : 'profissionalizamaisbrasil.com.br'
```

### 9. Checklist de Deploy

- [ ] Dominio principal adicionado na Vercel
- [ ] Wildcard `*.profissionalizamaisbrasil.com.br` adicionado na Vercel
- [ ] DNS do dominio principal configurado (A record → 76.76.21.21)
- [ ] DNS wildcard configurado (CNAME *.pmb → cname.vercel-dns.com)
- [ ] SSL gerado automaticamente pela Vercel (verificar)
- [ ] Vercel Token gerado e salvo nas env vars
- [ ] Vercel Project ID e Team ID salvos nas env vars
- [ ] Redis (Upstash) configurado e conectado
- [ ] Middleware testado com subdominio e dominio custom
- [ ] Paginas /loja/not-found e /loja/suspended criadas
- [ ] API /api/tenants/resolve criada (fallback do middleware)
