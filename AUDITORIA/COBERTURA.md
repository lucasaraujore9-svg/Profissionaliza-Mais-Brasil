# Cobertura & Status das Correções — Profissionaliza Mais Brasil
_Data: 2026-06-20 · Branch: `fix/auditoria-p0-p1-2026-06-20` · Portão Zero-Erro: ✅ verde_

Rastreio item-a-item da auditoria. Base: `INVENTARIO.md`. Detalhe: `achados/*.md`. Snapshot: `RELATORIO.md`.

## 1. Cobertura do inventário (sem amostragem) — confirmada na Fase 1

| Categoria | Total | Cobertura |
|---|---|---|
| Telas (`page.tsx`) | 124 | **124/124** revisadas (domínio frontend, por área) |
| Route handlers (`route.ts`) | 281 | **280/280** authz/tenant (seguranca) + 281 Zod/idempotência (api) + listagens (perf). 1 = `llms.txt` (público, N/A) |
| Componentes | 322 | **322/322** (frontend: links/estados/a11y; codigo: boundary-leak/naming) |
| `lib/` exports | ~577 (198 arq.) | varridos por ts-prune/madge/grep (codigo) + por domínio |
| Models / migrations | 43 / 67 | **43/43**, **67/67** (banco) |
| Crons / webhooks | 13 / 2 | **13/13** + **2/2** (api, devops, saas, perf) |
| Server Actions | 2 | 2/2 (codigo) |

**Build:** `next build` compila 100% das rotas (Turbopack + TS) — nenhuma rota/RSC quebrada.
**Telas:** todas as áreas têm `loading/error/not-found`; 1 único link morto em todo o app (FE-001, ainda Aberto).
**Handlers:** tenant SEMPRE derivado da sessão (zero IDOR por input); 143 com Zod, demais validam por outra via.

## 2. Status das correções desta rodada (Fase 2)

| ID | Sev | Status | Commit / Evidência |
|---|---|---|---|
| **DB-001 / LGPD-001** (cert CPF em bucket público) | P0 | **✅ Corrigido** | Bucket `certificates` → `public=false` (Management API; GET anônimo agora 400 no origin). Código: `6974065` (stream/signed-only; sem fallback à URL pública). CDN cache residual ≤1h (paths cuid não-enumeráveis). |
| **OPS-001** (build aplica migration / bootstrap em DB vazio) | P0 | **✅ Corrigido (código)** | `f27deb8` — `apply-pending` detecta banco vazio (coreSchemaExists) e roda migrations em vez de só marcar. *Mudança do fluxo de deploy (build deixar de aplicar migration) = decisão sua (ver §4).* |
| **SAAS-002** (reactivate-paid ignora tenant.status) | P1 | **✅ Corrigido** | `e4130fe` — guard `canReactivateUnderTenant` + teste |
| **API-001** (notification_url MP manual) | P1 | **✅ Corrigido** | `6ee408f` — usa `mpWebhookUrl()` + teste de webhook URLs |
| **QA-001** (sem teste de isolamento de tenant) | P1 | **✅ Corrigido** | `357eff0` — `scope.test.ts` (18 casos) |
| **QA-002** (sem teste do webhook Asaas) | P1 | **✅ Corrigido** | `72ce9e5` — `asaas/webhook.test.ts` (10 casos) |
| **QA-003 / COD-002** (CI sem build) | P1 | **✅ Corrigido** | `cfeb1a5` — step de build no `ci.yml` |
| **QA-004** (sem teste do motor de comissão) | P1 | **✅ Corrigido** | `558954b` — tiers + computeAvailableAt (19 casos) + stub server-only |
| **SAAS-001** (audit trail billing/permissão) | P1 | **🟡 Parcial** | `d66b521` — billing + papel/desativação cobertos. **Aberto:** cancelamento de tenant + criação de revenda (mesma receita logAudit). |

**Testes:** 44 → **79** casos verdes. Portão Zero-Erro: `tsc=0 lint=0(2 warn) test=0 build=0` (ver `portao.log`).

## 3. Itens ABERTOS (triados por prioridade) — recomendados para as próximas rodadas

| ID | Sev | Por que ainda aberto / próximo passo |
|---|---|---|
| **DB-001 (proof)** | P0→P1 | Comprovantes de saque no bucket público `vitrine-assets` (path aleatório, não-enumerável). Requer bucket privado + rota autenticada de leitura + UI + backfill (cópia de objetos exige `service_role`, ausente local). Receita: novo bucket `payout-proofs` privado, `uploadPrivateAsset`/download autenticado scoped, migrar `proofUrl`→path. |
| **SEG-001 / DB-003** (sem RLS) | P1 | **Decisão arquitetural sua.** Mitigado agora por QA-001 (teste de isolamento). Roadmap: RLS com `SET LOCAL app.tenant_id` + policies por tabela — não aplico sem seu aval (muda o modelo de acesso). |
| **PERF-001** (cache de tenant morto) | P1 | Alinhar chave do proxy a `keys.ts` + `setTenant` no resolve-tenant + popular em `getCurrentTenant`. Testável com Redis mockado. |
| **PERF-002 / PERF-003** (home/catálogo sem cache/paginação) | P1 | `unstable_cache` + `revalidateTag` na home; paginação keyset em `/cursos` e `/loja/cursos`. |
| **OBS-001** (sem error-tracking; boundary "já notificado" falso) | P1 | Implementar beacon `/api/internal/log` ou Sentry; corrigir a cópia falsa. |
| **DB-002** (FKs sem índice) | P1 | Migration aditiva idempotente (`CREATE INDEX IF NOT EXISTS`, sem CONCURRENTLY pelo runner transacional) + `@@index` no schema. Aplica no próximo deploy. |
| **OPS-006** (cron reconcile-tenant-payments não agendado) | P1 | Adicionar `cron.schedule` em `prisma/sql/pg_cron_jobs.sql` — **rodar SQL no Supabase é ação sua** (§4). |
| **LGPD-002** (pixels sem consentimento) | P1 | Gate de consentimento antes de carregar pixels (banner com opt-in real). |
| **LGPD-003** (exclusão não propaga p/ CPF do cert) | P1 | Anonimizar/remover `certificates.student_cpf` + objeto no fluxo de erasure do aluno. |
| **OBS-002 / LGPD-004** | P1 | Doc: DR/RTO-RPO/runbooks; ROPA + subprocessadores nominais. |
| **⚠️MIGRAÇÃO** (OPS-002/003/004/005, PERF-008) | P1 (pré-cutover) | Redis TCP, `output:standalone`+Docker, proxy Node, Storage→MinIO, otimizador de imagem. Não bloqueia prod atual. |
| P2/P3 (59) | P2/P3 | Detalhados em `achados/*.md` (FE-001..004, COD-001/003-006, PERF-004..009, OBS-003..008, DB-004..008, SEG-002..006, API-002..005, SAAS-003..007, LGPD-005..., QA-005..009). |

## 4. Ações que exigem você (nada disto foi executado sem aval)

1. **Deploy do branch** `fix/auditoria-p0-p1-2026-06-20` (push/merge → Vercel). *A prod atual já está consistente com o bucket privado (verificado), mas as melhorias de código estão no branch.*
2. **Fluxo de deploy** — decidir se `npm run build` deve continuar aplicando migration na prod (hoje aplica). Recomendado: mover para um step de deploy dedicado (`prisma migrate deploy`/script) fora do `next build`.
3. **RLS** (SEG-001) — decisão arquitetural.
4. **SQL no Supabase** — agendar o cron `reconcile-tenant-payments` (OPS-006).
5. **Proof migration** (DB-001 proof) — criar bucket privado + backfill (precisa `service_role`).
6. **Bucket flip** — ✅ já autorizado e **executado** nesta rodada (`certificates` privado).

> Já executado por mim sob sua autorização: flip do bucket `certificates` para privado (Supabase Management API).
