# Issue 122 — Cache de dados quentes e connection pooler (PgBouncer)

**Tipo:** perf (remediação)
**Escopo:** `src/lib/prisma.ts` · `DATABASE_URL` (Supabase pooler) · dashboards (`admin/dashboard`, `painel/dashboard`, `admin/analytics`) · `getSystemSettings` · `src/lib/redis/*`
**Depende de:** nenhuma
**Prioridade:** P2
**Risco:** R32 (Médio)

## Contexto / Evidência
- `getSystemSettings` sem cache no hot-path; dashboards sem cache.
- Pool `max=10` conectando direto na porta **5432** (sem PgBouncer) → risco de esgotar as ~60 conexões
  do plano free do Supabase sob carga (várias instâncias serverless quentes na Vercel).

## O Que Fazer
1. Usar o **pooler do Supabase (porta 6543 / PgBouncer)** no `DATABASE_URL` de runtime (transaction mode),
   mantendo `DIRECT_URL` (5432) só para migrations.
2. Cachear `getSystemSettings` e dados de dashboard em Redis (TTL curto) com invalidação em update.
3. Revisar `DATABASE_POOL_MAX` conforme o modo do pooler.

## Critério de Aceite
- [ ] Runtime usa pooler (6543); migrations usam `DIRECT_URL`.
- [ ] `getSystemSettings`/dashboards cacheados com invalidação.
- [ ] Teste de carga leve não esgota conexões.
- [ ] R32 atualizado em `audit/MATRIZ_DE_RISCOS.md`.
- [ ] `npm run typecheck` + `lint` verdes.
