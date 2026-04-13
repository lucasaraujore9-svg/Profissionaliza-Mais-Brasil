# Issue 028 — Redis Tenant Cache (Upstash)

**Tipo:** infra
**Página:** global
**Depende de:** nenhuma
**Prioridade:** P0

## O Que Fazer

Implementar cache Upstash Redis para tenant data (domain → tenant_id mapping). Edge Runtime compatible, TTL 5min, set/get/invalidate operations. Usado no middleware e em API routes.

## Componentes Envolvidos
- lib/redis.ts — Redis client singleton (Upstash REST API)
- lib/redis/cache.ts — cache logic set/get/invalidate/ttl
- lib/redis/keys.ts — key generation patterns (tenant:domain, tenant:id)
- lib/redis/errors.ts — custom redis errors

## Comportamentos
- `cache-set` — Redis set com TTL 5min
- `cache-get` — Redis get domain/id mapping
- `cache-invalidate` — Redis del ao atualizar tenant
- `cache-fallback` — se Redis falha, query Supabase
- `edge-runtime-compatible` — usar Upstash REST (não client TCP)

## Critério de Aceite
- [ ] lib/redis.ts criado com Upstash REST client
- [ ] UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN em .env
- [ ] set(key: string, value: string, ttl: number): Promise<void>
- [ ] get(key: string): Promise<string | null>
- [ ] invalidate(key: string): Promise<void>
- [ ] TTL padrão 5 minutos (300 segundos)
- [ ] Keys pattern: tenant:domain:{domain}, tenant:id:{id}
- [ ] Funciona em Edge Runtime (usado em middleware)
- [ ] Fallback Supabase query se Redis fails
- [ ] Error handling com logging
- [ ] No sensitive data cached
