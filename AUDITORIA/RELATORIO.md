# Relatório de Auditoria — Profissionaliza Mais Brasil
_Data: 2026-06-20 · Auditoria somente-leitura, cobertura total (sem amostragem) · 11 domínios · Opus 4.8_

Base de cobertura: `auditoria/INVENTARIO.md` (959 arquivos · 124 telas · 281 route handlers · 322 componentes · 43 models · 67 migrations · 8 testes/44 casos).
Detalhe por domínio: `auditoria/achados/<dominio>.md`.

---

## Sumário executivo

O sistema está **maduro e em bom estado estrutural**: o Portão de tipos/lint/testes já está **verde** (`tsc --noEmit` 0 erros · `eslint` 0 erros/2 warnings · `vitest` 44/44), type-safety exemplar (zero `any`/`ts-ignore`), apenas **1 link morto** em 124 telas, postura de segurança sólida (tenant sempre derivado da sessão — **zero IDOR por input**, webhooks com HMAC/token timing-safe, AES-256-GCM correto, headers+CSP presentes, rate-limit nos fluxos públicos), e núcleo financeiro robusto (idempotência de fulfill com advisory lock, re-fetch autoritativo nos webhooks, CAS no payout).

Os riscos concentram-se em **3 frentes**:

1. **🔴 P0 — Exposição de PII (LGPD) e segurança de deploy.** (a) Buckets do Supabase Storage são **públicos e guardam PII** — certificados com CPF e comprovantes de saque; **exploração confirmada ao vivo** (GET anônimo → HTTP 200 com `student_cpf`). (b) `npm run build` **aplica migrations na produção durante o build**, e o bootstrap pode marcar as 67 migrations como "aplicadas" sem rodá-las contra um Postgres novo (risco direto na migração VPS).
2. **🟠 P1 — Correção de negócio e rede de segurança.** Cron `reactivate-paid` devolve acesso a aluno de revenda inadimplente (fura o bloqueio); `notification_url` do MP por concatenação manual pode perder matrícula automática; **ausência de RLS** (isolamento 100% em código, sem rede); **ausência de teste de isolamento de tenant**; CI sem `next build`; audit trail ausente em billing/lifecycle.
3. **🟡 ⚠️MIGRAÇÃO — Vercel→VPS.** `@upstash/redis` (REST) não fala Redis TCP; sem `output:'standalone'`/Dockerfile; proxy em Edge runtime; Supabase Storage→MinIO; crons via pg_cron→scheduler próprio; otimizador de imagem inexistente fora da Vercel. **Cache de tenant é código morto** (proxy lê uma chave que ninguém escreve) — o "cache de 5min" prometido não existe.

**Veredito:** nenhuma brecha de vazamento cross-tenant *ativa* e nenhum billing quebrado, mas **2 P0 reais** exigem ação imediata (1 deles é exposição de dado pessoal sensível em produção, comprovada).

---

## Nota por domínio

| Domínio | Nota | P0 | P1 | P2 | P3 | Destaque |
|---|---|---|---|---|---|---|
| seguranca | 8.5 | 0 | 1 | 2 | 3 | Postura madura; falta RLS como rede |
| banco | 6.5 | **1** | 2 | 4 | 3 | Bucket público c/ PII (P0); FKs sem índice; sem RLS |
| codigo | 8.5 | 0 | 0 | 2 | 4 | Gate verde, type-safe exemplar |
| performance | 6.0 | 0 | 3 | 4 | 2 | Cache de tenant morto; home/catálogo sem cache/paginação |
| observabilidade | 6.5 | 0 | 2 | 4 | 2 | Logging excelente; sem error-tracking nem DR |
| frontend | 8.5 | 0 | 0 | 1 | 3 | 1 link morto; estados/a11y/tenant-aware OK |
| api | 8.5 | 0 | 1 | 2 | 2 | Webhooks/idempotência sólidos; 1 URL manual |
| devops | 5.0 | **1** | 5 | 4 | 3 | Build aplica migration na prod (P0); migração VPS |
| saas | 7.5 | 0 | 2 | 3 | 2 | Núcleo financeiro forte; audit trail e 1 furo de lifecycle |
| lgpd | 4.0 | **1** | 3 | 2 | 2 | CPF em bucket público (P0); consentimento; ROPA |
| testes | 3.0 | 0 | 4 | 4 | 1 | 44/44 verdes, mas 8 testes p/ ~858 unidades |
| **TOTAL** | — | **3** | **23** | **32** | **27** | — |

> P0 reais = 3 IDs, mas **DB-001 e LGPD-001 são o mesmo root cause** (bucket público c/ PII) → **2 causas-raiz P0**.

---

## Backlog priorizado — P0 e P1 (por risco × esforço)

### 🔴 P0 — antes de qualquer outra coisa

| # | ID(s) | Problema | Esforço | Ação |
|---|---|---|---|---|
| 1 | **DB-001 = LGPD-001** | Bucket Supabase `certificates` (e proof de saque) **público com CPF/PII** — GET anônimo 200 confirmado | Médio | Código: garantir signed URL em todo read-path + parar de persistir/retornar URL pública + backfill. **Flip do bucket p/ privado no Supabase = ação manual sua** (descrever) |
| 2 | **OPS-001** | `build` roda `db:apply-pending` (aplica DDL na PROD); bootstrap marca 67 migrations "aplicadas" sem rodar em DB novo; `20260413_init` não-idempotente | Médio | Código: tornar `apply-pending` seguro (respeitar `SKIP_PENDING_MIGRATIONS`, não auto-marcar em DB vazio), `init` idempotente. **Mudança de fluxo de deploy = descrever p/ você decidir** |

### 🟠 P1 — correção de negócio + rede de segurança (ordem sugerida)

| # | ID | Domínio | Problema | Esforço |
|---|---|---|---|---|
| 3 | **SAAS-002** | saas | `reactivate-paid` reativa aluno sem checar `tenant.status` → inadimplente recupera acesso | Baixo (+teste) |
| 4 | **API-001** | api | `notification_url` MP por concatenação manual (`admin/vendas/route.ts:447`) → venda avulsa pode não matricular | Baixo (+teste) |
| 5 | **QA-001** | testes | Sem teste de isolamento de tenant (mitiga SEG-001/DB-003) | Baixo |
| 6 | **QA-003 = COD-002** | testes/codigo | CI não roda `next build` (Portão incompleto) | Baixo |
| 7 | **QA-002** | testes | Webhook Asaas (ativa/suspende tenant) sem teste de assinatura | Baixo |
| 8 | **QA-004** | testes | Motor de comissão/clawback sem teste (cálculo financeiro) | Médio |
| 9 | **SAAS-001** | saas | Audit trail ausente em billing/cancelamento de tenant/mudança de role | Médio |
| 10 | **OBS-001** | observ. | Sem error-tracking; error boundaries afirmam "já notificado" (falso) | Médio |
| 11 | **DB-002** | banco | FKs sem índice (Enrollment/Payment/Coupon/…) | Médio (migration aditiva, `CONCURRENTLY`) |
| 12 | **PERF-001** | perf | Cache de tenant é código morto (proxy lê chave que ninguém grava) | Médio |
| 13 | **PERF-003** | perf | Catálogo público `/cursos` e `/loja/cursos` sem paginação | Médio |
| 14 | **PERF-002** | perf | Home/vitrine `force-dynamic` sem cache + fan-out serial | Médio |
| 15 | **OPS-006** | devops | Cron `reconcile-tenant-payments` existe mas **não está agendado** | Baixo (SQL pg_cron = ação manual sua) |
| 16 | **LGPD-002** | lgpd | Pixels/cookies carregam antes do consentimento (banner só "Entendi") | Médio |
| 17 | **LGPD-003** | lgpd | Exclusão do aluno não propaga p/ CPF no certificado (DB+storage) | Baixo (ligado ao #1) |
| 18 | **SEG-001 = DB-003** | seg/banco | Sem RLS — isolamento 100% em código | **Arquitetural → PARAR e descrever** (mitigação imediata = #5) |
| 19 | **OBS-002** | observ. | Sem DR/RTO/RPO/runbooks | Doc/processo |
| 20 | **LGPD-004** | lgpd | Sem lista nominal de subprocessadores / ROPA | Doc |
| 21–25 | **OPS-002/003/004/005**, PERF/COD migração | devops | ⚠️MIGRAÇÃO Vercel→VPS (Redis TCP, standalone/Docker, proxy Edge, MinIO) | Pré-cutover (não "agora") |

---

## ⚠️MIGRAÇÃO Vercel→VPS — checklist consolidado (não bloqueia produção atual)

1. **Redis REST→TCP:** `@upstash/redis` + `@upstash/ratelimit` + fetch REST cru em `proxy.ts:163,184` e `redis/cache.ts:36` não falam TCP → `ioredis`/`redis` ou SRH. Cache de tenant e rate-limit quebram sem isso. (OPS-003/PERF/COD)
2. **`output:'standalone'`** ausente + faltam Dockerfile multi-stage, `.dockerignore`, compose/stack Swarm, Traefik labels, healthcheck de container (`/api/health` já serve). (OPS-002)
3. **Proxy Edge** (`src/proxy.ts`) não existe no Swarm → vira Node middleware; rever premissas (Redis REST, "sem Prisma"). (OPS-004)
4. **Supabase Storage→MinIO/S3:** recriar buckets, migrar objetos, reescrever URLs no banco, ajustar CSP. (OPS-005) — converge com o fix P0 do bucket privado.
5. **Vercel-specific:** `@vercel/analytics`+`speed-insights` viram no-op; **domínios custom/SSL** via `lib/vercel/client.ts` → Traefik + Let's Encrypt (DNS-01 p/ wildcard) — impacto de negócio em revendas. Otimizador de imagem (`images.unoptimized`) inexistente fora da Vercel. (OPS-007/PERF-008)
6. **Postgres self-hosted:** Supavisor→pgBouncer (revisar `max` do Pool), manter `DIRECT_URL` p/ migrations, **backup pg_dump+WAL com restore testado**. (OPS-010/DB-006)
7. **Crons pg_cron/pg_net** (extensões Supabase) → scheduler próprio (recriar `app_internal.run_cron` + 13 jobs, ou cron de sistema chamando `/api/cron/*` c/ `CRON_SECRET`). (OPS-011)
8. **Secrets via Docker Swarm** (`/run/secrets`, suporte `*_FILE` em `env.ts`); pinar Node (`engines`/`.nvmrc`); staging fiel + plano de cutover. (OPS-008/009/013)
9. **Crons longos** (PERF-005/006) → worker BullMQ.
10. **Residência de dados/subprocessadores** mudam → atualizar Política + ROPA antes do cutover. (LGPD-005)

---

## Cobertura

Todos os itens do `INVENTARIO.md` receberam veredito por ≥1 domínio:
- **281 route handlers** → seguranca (authz/tenant), api (Zod/idempotência), performance (listagens). 280/280 sem IDOR por input; 143 com Zod, 137 sem-Zod validam por outra via (typeof/formData/assinatura).
- **124 telas + 322 componentes** → frontend (1 link morto, resto OK).
- **198 lib / ~577 exports** → codigo (ts-prune/madge/grep), performance, seguranca.
- **43 models / 67 migrations** → banco (índices, RLS, runner), saas (lifecycle).
- **13 crons / 2 webhooks** → api + performance + saas + devops.
- **8 testes** → testes (44/44 verdes; lacunas mapeadas).
Lacuna de cobertura: nenhuma área do inventário ficou sem auditor. Itens N/A documentados em cada `achados/*.md` (ex.: SSRF/SQLi/CORS N/A em seguranca).

---

## Próximos passos (Fase 2)

Ordem recomendada de `/corrigir`, começando por **segurança e banco** (regra da missão):
1. **P0 #1 (DB-001/LGPD-001)** — parte de código (signed URLs/backfill) + **descrever a você** o flip do bucket Supabase.
2. **P0 #2 (OPS-001)** — hardening do `apply-pending` + `init` idempotente + **descrever a você** a mudança de deploy.
3. **P1 quick-wins atômicos com teto verde:** SAAS-002 → API-001 → QA-001 → QA-003/COD-002 → QA-002 → QA-004.
4. **P1 médios:** SAAS-001, OBS-001, DB-002, PERF-001/002/003.
5. **Itens que exigem ação manual sua** (não executo sem OK): flip de bucket, mudança de deploy, RLS (arquitetural), SQL pg_cron (OPS-006), rotação de segredo, qualquer migration destrutiva.

> Cada correção seguirá **Portão Zero-Erro** (typecheck→lint→build→test) e commit atômico; vermelho → reverte e deixa Aberto.
