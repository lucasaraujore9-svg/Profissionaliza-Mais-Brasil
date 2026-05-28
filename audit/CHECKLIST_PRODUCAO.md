# Checklist de Produção — PMB

Marque cada item antes de considerar o sistema pronto para produção séria.
Legenda: ✅ pronto · ⚠️ parcial/risco · ❌ pendente · 🔵 ação operacional

## Segurança
- [ ] ❌ **R1** — Bucket de certificados privado + signed URLs; CPF fora de URL pública
- [ ] ❌ **R4** — Autorização de papéis PMB escopada por `accountManagerId`/SUPER_ADMIN
- [ ] ❌ **R6** — Cap de desconto cobre cupom FIXED
- [ ] ❌ **R10** — Senha temporária não trafega em JSON/logs
- [ ] ⚠️ **R18** — CSP sem `unsafe-inline`/`unsafe-eval` (migrar para nonce)
- [ ] ❌ **R19/R20** — Rate-limit em uploads; IP confiável no rate-limit
- [x] ✅ Headers de segurança (HSTS, X-Frame DENY, nosniff, Referrer-Policy, Permissions-Policy)
- [x] ✅ Webhooks com assinatura (Asaas token, MP HMAC) + idempotência
- [x] ✅ Rate-limit fail-closed em produção
- [x] ✅ Tokens MP por tenant criptografados (AES-256-GCM)
- [x] ✅ Proxy sanitiza headers de tenant; sem secret em `NEXT_PUBLIC_*`; sem `eval`

## Banco / Dados
- [ ] ⚠️ **R3** — Estratégia de defesa em profundidade (RLS ou role não-owner) decidida e documentada
- [ ] ❌ **R12** — Policies em `storage.objects`; buckets com PII privados
- [ ] ⚠️ **R25** — `onDelete` das FKs de Tenant revisado (sem reclassificação contábil)
- [ ] ⚠️ **R26** — CHECK de coerência tenant↔registro
- [x] ✅ Índices compostos para queries quentes (`20260524_composite_indexes`)
- [ ] 🔵 Backups do Supabase confirmados e testados (restore)

## Dinheiro / Regras de negócio
- [ ] ❌ **R2** — Rollback de enrollment órfão no `/api/checkout`
- [ ] ❌ **R5** — Cálculo de desconto em Decimal em todas as 4 rotas de checkout
- [ ] ❌ **R7** — `addMonthsClamped` no sweep de inadimplência
- [ ] ❌ **R8** — Bloqueio na plataforma parceira em OVERDUE de venda direta PMB
- [ ] ❌ **R9** — Rate-limit no `/api/checkout`

## Deploy / Ambientes
- [ ] ⚠️ **R17** — `pg_advisory_lock` no apply-pending; ou migrar p/ `prisma migrate deploy` gated
- [ ] ❌ Ambiente de **staging** separado (previews não devem apontar p/ DB de produção)
- [ ] ⚠️ **R37** — `db:reset --force` protegido contra `NODE_ENV=production`
- [ ] 🔵 **R31** — Configurar no Vercel: `MP_WEBHOOK_SECRET`, `AUTH_SECRET`, `PMB_*`, `WA_GATEWAY_*`, `CRON_SECRET`, `INTERNAL_SECRET`, `ENCRYPTION_KEY` (todas as obrigatórias de `env.ts`)
- [x] ✅ `.env.example` completo e alinhado a `env.ts` (corrigido nesta auditoria)
- [x] ✅ `assertEnv()` fail-fast no boot em produção
- [x] ✅ CI roda lint + typecheck
- [ ] ❌ CI roda **testes** (não existem) e **build** com `SKIP_PENDING_MIGRATIONS=1`

## Observabilidade
- [x] ✅ Logs estruturados (Pino), eventos de auth, `/api/health`
- [ ] ❌ **R14** — Audit log persistido em banco (não só stdout)
- [ ] 🔵 Log drain / Axiom configurado; alerta para "Redis ausente" e "MP_WEBHOOK_SECRET ausente"
- [ ] 🔵 Monitor de conexões do Postgres (R32) e Core Web Vitals

## Performance
- [ ] ❌ **R16** — Relatórios/broadcast/analytics com limite e agregação em SQL
- [ ] ⚠️ **R32** — PgBouncer (porta 6543) + cache Redis nos dashboards

## Acessibilidade / UI
- [ ] ❌ **R30** — 5 itens WCAG nível Alto corrigidos
- [ ] 🔵 Rodar axe-core/Lighthouse nas páginas públicas e do aluno

## Testes
- [ ] ❌ Vitest (unit) + Playwright (e2e) instalados
- [ ] ❌ Cobertura mínima dos 6 fluxos críticos (ver PLANO_DE_ACAO FASE 2)
