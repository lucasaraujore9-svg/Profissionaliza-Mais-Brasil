# Relatório de Auditoria — Profissionaliza Mais Brasil
_Data: 2026-06-24 · Auditoria somente-leitura, cobertura total (sem amostragem) · 11 domínios · Opus 4.8_

Base de cobertura: `auditoria/INVENTARIO.md` — **131 telas · 294 route handlers (390 métodos) · 324 componentes · 193 módulos lib · 44 models · 33 enums · 75 migrations · 16 crons · 3 webhooks · 37 testes/218 casos**.
Detalhe por domínio: `auditoria/achados/<dominio>.md`. Esta rodada **re-verificou** cada achado de 2026-06-20 contra o código atual e auditou os commits recentes (webhook LMS, credenciais por matrícula, branding white-label, sub-revendas).

---

## Sumário executivo

O sistema **melhorou de forma relevante desde 2026-06-20**. O Portão Zero-Erro segue verde (`tsc` 0, `eslint` 0/1, **218 testes**), a suíte de testes saltou de 8 arquivos/44 casos para **37/218**, o CI agora roda **Lint+Typecheck+Test+Build** bloqueando merge, e **~20 achados anteriores foram fechados** — entre eles: `xlsx` HIGH (→ `exceljs`), webhook MP perdido no apex (→ `mpWebhookUrl()`), `/health` vazando erro do DB, erasure do aluno propagando para o CPF do certificado, fallback de URL pública de certificado removido, 4 furos de lifecycle SaaS (reactivate-paid, automação, price>0, refund/payout), e o P0 anterior do bootstrap de migrations (→ `coreSchemaExists`). **Os 4 commits recentes (LMS/sub-revendas) foram auditados em detalhe e NÃO introduziram brechas** — HMAC timing-safe + anti-replay + idempotência no webhook LMS, AES-256-GCM nas credenciais por matrícula, authz escopada por `referrerTenantId` nas sub-revendas.

Os riscos remanescentes concentram-se em **4 frentes**:

1. **🔴 P0 — Exposição de PII (1 causa-raiz, mitigada mas não fechada).** `DB-001 = LGPD-001`: o bucket `certificates` do Supabase guarda PDF com **CPF+nome** e o código **ainda persiste/gera URL pública** (`/object/public/`) em `Certificate.pdfUrl`. **Mitigações já presentes:** read-paths usam signed URL/stream, path usa `cuid` não-enumerável, comprovantes de saque já migraram para bucket privado. **O que falta:** (a) parar de gerar/persistir URL pública + backfill (código — eu faço); (b) **virar o bucket para privado no Supabase** (ação manual sua). Enquanto o bucket estiver público, GET anônimo vaza CPF.

2. **🟠 P1 — Negócio/UX e LGPD corrigíveis agora (código).** `PERF-002` (home/vitrine `force-dynamic`, **zero** `unstable_cache`/`revalidateTag` em todo `src/`, fan-out serial de seções → TTFB/LCP ruins na página de maior tráfego); `PERF-003` (catálogo público `/cursos` e `/loja/cursos` **sem paginação** e com `include` completo); `LGPD-002` (pixels/Analytics **carregam antes do consentimento**; banner só "Entendi", sem recusar — propaga para todas as vitrines).

3. **🟠 P1 — Arquitetural / processo (decisão sua).** `SEG-001 = DB-002` (**sem RLS** — isolamento 100% em código; sem rede de segurança no banco — arquitetural); `OPS-001` (`npm run build` **aplica migrations na prod** — acoplamento build↔schema-prod, rebaixado de P0); `OBS-002` (sem DR/RTO/RPO/runbooks); `LGPD-004` (sem ROPA / lista de subprocessadores).

4. **🟡 ⚠️MIGRAÇÃO Vercel→VPS (não "agora", pré-cutover).** `OPS-002/003/004/005`: sem `output:'standalone'`/Dockerfile; `@upstash/redis` (REST) **não fala Redis TCP**; `proxy.ts` assume Edge-runtime; Supabase Storage→MinIO (reescrever URLs persistidas). Prontidão VPS ainda baixa, mas **não bloqueia a produção atual**.

**Veredito:** nenhum vazamento cross-tenant ativo, nenhum billing/checkout quebrado, Portão verde. **1 causa-raiz P0 real** (CPF em bucket público — parte código eu fecho, parte flip do bucket é sua) + um conjunto de P1 de performance/LGPD corrigíveis agora e P1 arquiteturais/migração que exigem sua decisão.

---

## Nota por domínio

| Domínio | Nota | P0 | P1 | P2 | P3 | Destaque |
|---|---|---|---|---|---|---|
| seguranca | 8.5 | 0 | 1 | 3 | 3 | Postura madura; commits LMS corretos; falta RLS como rede |
| banco | 7.5 | **1** | 1 | 2 | 4 | 4 achados antigos fechados; bucket c/ PII (P0) + sem RLS |
| codigo | 8.7 | 0 | 0 | 3 | 2 | Gate verde, zero `any`; env espalhado + catches silenciosos |
| performance | 6.0 | 0 | 2 | 7 | 3 | Zero cache de dados; home/catálogo sem cache/paginação |
| observabilidade | 6.8 | 0 | 1 | 5 | 3 | Logging exemplar; sem error-tracker/DR; PII bruta em WebhookLog |
| frontend | 8.7 | 0 | 0 | 1 | 2 | 3/4 antigos corrigidos; LMS access devolve JSON cru (P2) |
| api | 9.3 | 0 | 0 | 0 | 3 | Webhooks/idempotência sólidos; 2 riscos antigos fechados |
| devops | 6.0 | 0 | 5 | 4 | 2 | P0 fechado, CI c/ build; 5 P1 são ⚠️MIGRAÇÃO |
| saas | 8.5 | 0 | 0 | 2 | 3 | Núcleo financeiro forte; 4 lifecycle fixes; audit trail parcial |
| lgpd | 5.0 | **1** | 2 | 2 | 3 | CPF em bucket público (P0); consentimento; ROPA |
| testes | 7.0 | 0 | 0 | 5 | 1 | Saltou 3→7: 218 testes, CI c/ build; falta E2E + 3 gaps LMS |
| **TOTAL** | — | **2** | **12** | **34** | **29** | — |

> **P0 reais = 2 IDs (`DB-001` e `LGPD-001`) = 1 causa-raiz** (bucket público com PII). `SEG-001` e `DB-002` também são o mesmo achado (sem RLS).

---

## Backlog priorizado — P0 e P1 (por risco × esforço)

### 🔴 P0 — antes de qualquer outra coisa

| # | ID(s) | Problema | Parte código (eu) | Parte manual (você) |
|---|---|---|---|---|
| 1 | **DB-001 = LGPD-001** | Bucket `certificates` com CPF; `pdfUrl` pública persistida | Parar de gerar/persistir `/object/public/` em `pdfUrl`; garantir signed URL em todo read-path; backfill dos `pdfUrl` existentes; teste | **Virar o bucket `certificates` → privado no Supabase** (descrevo o passo) |

### 🟠 P1 — corrigíveis agora (código, com Portão)

| # | ID | Domínio | Problema | Esforço |
|---|---|---|---|---|
| 2 | **PERF-003** | perf | Catálogo público `/cursos` e `/loja/cursos` sem paginação + `include` completo | Médio (+teste) |
| 3 | **PERF-002** | perf | Home/vitrine `force-dynamic` sem cache de dados + fan-out serial de seções | Médio (+teste) |
| 4 | **LGPD-002** | lgpd | Pixels/Analytics carregam antes do consentimento; banner sem "recusar" | Médio (+teste) |

### 🟠 P1 — decisão sua (arquitetural / processo)

| # | ID | Domínio | Problema | Natureza |
|---|---|---|---|---|
| 5 | **SEG-001 = DB-002** | seg/banco | Sem RLS — isolamento 100% em código | Arquitetural → **descrever** (mitigação = tenant sempre derivado da sessão, já em vigor) |
| 6 | **OPS-001** | devops | `build` aplica migrations na prod (acoplamento) | Posso **endurecer** o runner; mudar o fluxo de deploy = **decisão sua** |
| 7 | **OBS-002** | observ. | Sem DR/RTO/RPO/runbooks | Doc/processo (posso escrever o runbook) |
| 8 | **LGPD-004** | lgpd | Sem ROPA / lista de subprocessadores | Doc (posso escrever; precisa sua validação de DPAs) |

### 🟡 P1 — ⚠️MIGRAÇÃO Vercel→VPS (não "agora", pré-cutover)

| # | ID | Problema |
|---|---|---|
| 9 | **OPS-002** | Sem `output:'standalone'` / Dockerfile / .dockerignore / compose / .nvmrc |
| 10 | **OPS-003** | `@upstash/redis` (REST) não fala Redis TCP (proxy + ratelimit) |
| 11 | **OPS-004** | `proxy.ts` assume Edge-runtime — revalidar p/ Node no Swarm |
| 12 | **OPS-005** | Supabase Storage REST → MinIO (reescrever URLs persistidas) |

---

## ⚠️MIGRAÇÃO Vercel→VPS — checklist consolidado (não bloqueia produção atual)

1. **Redis REST→TCP:** `@upstash/redis` + `@upstash/ratelimit` + fetch REST cru em `proxy.ts` → `ioredis`/`redis` ou SRH. Cache de tenant e rate-limit quebram sem isso. (OPS-003)
2. **`output:'standalone'`** ausente + faltam Dockerfile multi-stage, `.dockerignore`, stack Swarm, Traefik labels, `.nvmrc`/`engines`. (OPS-002/010)
3. **Proxy Edge** (`src/proxy.ts`) vira Node middleware no Swarm — rever premissas (Redis REST, hop interno). (OPS-004)
4. **Supabase Storage→MinIO/S3:** recriar buckets, migrar objetos, **reescrever URLs persistidas** no banco, ajustar CSP (`s3.bmbr.com.br` falta em `connect-src`). Converge com o fix P0 do bucket privado. (OPS-005)
5. **Domínios custom/SSL** via `lib/vercel/client.ts` → Traefik + Let's Encrypt (impacto de negócio em revendas com domínio próprio). Otimizador de imagem (`images.unoptimized`) inexistente fora da Vercel. (OPS-006/PERF-008)
6. **Postgres self-hosted:** Supavisor→pgBouncer (transaction mode, revisar `max`, prepared statements), manter `DIRECT_URL`, **backup pg_dump+WAL com restore testado**. (OPS-008)
7. **Crons pg_cron/pg_net** (extensões Supabase) → scheduler próprio (16 jobs). (OPS-009)
8. **Secrets via Docker Swarm** (`/run/secrets`, suporte `*_FILE` em `env.ts`); migrar 59 leituras de `process.env` diretas. (OPS-007/COD-003)
9. **Observabilidade:** Vercel Log Drains/Analytics somem → Loki/Promtail + GlitchTip + Prometheus/Grafana antes do corte. (OBS-006)
10. **LGPD:** residência de dados/subprocessadores mudam → atualizar Política + ROPA antes do cutover. (LGPD-005)

---

## Cobertura

Todos os itens do `INVENTARIO.md` receberam veredito por ≥1 domínio (cada `achados/*.md` traz a seção Cobertura):
- **294 route handlers** → seguranca (authz/tenant: 294/294), api (Zod/idempotência), performance (listagens). Sem IDOR por input.
- **131 telas + 324 componentes** → frontend (131/131; 3/4 achados antigos corrigidos; FE-005 novo).
- **193 lib** → codigo, performance, seguranca.
- **44 models / 75 migrations** → banco (índices/RLS/runner), saas (lifecycle).
- **16 crons / 3 webhooks** → api + performance + saas + devops + observabilidade.
- **37 testes/218 casos** → testes (verdes; lacunas E2E + 3 gaps LMS mapeados).
- Itens N/A documentados em cada `achados/*.md`. **Sem lacuna de cobertura.**

---

## Próximos passos (Fase 2) — proposta de ordem

Começando por **segurança/banco** (regra da missão), atômico e com Portão Zero-Erro por achado:

1. **P0 #1 (DB-001/LGPD-001)** — parte de código (parar URL pública + signed URL + backfill + teste). **Descrevo a você** o flip do bucket Supabase (parte manual).
2. **P1 corrigíveis agora:** PERF-003 → PERF-002 → LGPD-002 (cada um com teste).
3. **P2/P3 de maior valor por domínio:** FE-005 (JSON cru no acesso LMS), COD-006 (catches silenciosos no fluxo financeiro), QA-010/011/012 (testes do webhook LMS), LGPD-009 (retenção de leads/contatos), API-006 (idempotência por header), DB-006 (retenção `email_logs`), OBS-008/009.
4. **Itens que exijo seu OK** (não executo sem confirmação): flip de bucket (P0 manual), RLS (arquitetural), mudança de fluxo de deploy (OPS-001), setar/rotacionar segredos no Vercel, qualquer migration destrutiva, itens ⚠️MIGRAÇÃO.

> Cada correção segue **Portão Zero-Erro** (install→typecheck→lint→build→test) e commit atômico; vermelho → reverte e deixa `Aberto`.
