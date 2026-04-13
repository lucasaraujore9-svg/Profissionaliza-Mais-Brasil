# Issue 021 — Middleware Multi-Tenant

**Tipo:** infra
**Página:** global
**Depende de:** 020
**Prioridade:** P0

## O Que Fazer

Implementar middleware Next.js (Edge Runtime) que resolve tenant a partir do hostname. Três caminhos: main domain → rotas normais, subdomain → rewrite /loja/*, custom domain → rewrite /loja/*. Cache Upstash Redis com TTL 5min.

## Componentes Envolvidos
- middleware.ts — middleware Edge Runtime Next.js 15
- lib/tenant/resolver.ts — função resolve tenant (main/subdomain/custom)
- lib/redis.ts — Upstash client para cache
- lib/tenant/cache.ts — cache set/get/invalidate logic

## Comportamentos
- `resolve-main-domain` — profissionalizamaisbrasil.com.br → rotas normais
- `resolve-subdomain` — minhaempresa.* → rewrite para /loja/*
- `resolve-custom-domain` — dominio.com.br → rewrite para /loja/*
- `cache-tenant-5min` — cache Upstash com TTL 5min
- `fallback-supabase` — se Redis falha, query Supabase

## Critério de Aceite
- [ ] middleware.ts criado em src/middleware.ts
- [ ] Roda em Edge Runtime (não usa Prisma direto)
- [ ] Resolver logic para 3 caminhos domain correto
- [ ] Main domain: professionalizamaisbrasil.com.br rotas (/, /login, /seja-revendedor, /admin, /painel)
- [ ] Subdomain: *.profissionalizamaisbrasil.com.br rewrite /loja/* com tenant_id
- [ ] Custom domain: dominio-custom.com.br rewrite /loja/* com tenant_id
- [ ] Upstash Redis cache set/get/invalidate
- [ ] TTL cache 5 minutos
- [ ] Fallback Supabase Query (no Edge) se Redis falha
- [ ] Subdominios reservados blocked: www, app, api, admin, painel, mail, smtp, ftp, cdn, assets, static, staging, dev, test
- [ ] Request context contém tenant_id no headers
