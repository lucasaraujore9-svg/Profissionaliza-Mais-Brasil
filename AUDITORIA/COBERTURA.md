# Cobertura & Status das Correções — Profissionaliza Mais Brasil
_Atualizado: 2026-06-20 · Branch: `fix/auditoria-p0-p1-2026-06-20` · Portão Zero-Erro: ✅ verde (116 testes)_

Rastreio item-a-item. Base: `INVENTARIO.md`. Detalhe: `achados/*.md`. Snapshot: `RELATORIO.md`. Execuções do portão: `portao.log`.

## 1. Cobertura do inventário (sem amostragem)

124/124 telas · 280/281 route handlers (1 = `llms.txt`, N/A) · 322/322 componentes · 43/43 models · 67/67 migrations · 13/13 crons · 2/2 webhooks. `next build` compila 100% das rotas. Detalhe por domínio nas seções `## Cobertura` de cada `achados/*.md`.

## 2. Correções aplicadas (✅ = corrigido + Portão verde + commit)

| ID | Sev | Status | Evidência |
|---|---|---|---|
| **DB-001 / LGPD-001** (PII em buckets públicos) | P0 | ✅ **Fechado** | Bucket `certificates`→privado + serve por stream/signed (`6974065`); comprovantes de saque → bucket privado `payout-proofs` + leitura autenticada/escopada (`e0819c2`). Origin anônimo = 400. |
| **OPS-001** (build aplica migration / bootstrap em DB vazio) | P0 | ✅ **Fechado (código)** | `f27deb8` — schema-aware bootstrap. *Mudança do fluxo de deploy = decisão sua.* |
| **SAAS-002** (reactivate-paid fura inadimplência) | P1 | ✅ | `e4130fe` + teste |
| **API-001** (notification_url MP) | P1 | ✅ | `6ee408f` + teste |
| **QA-001** (teste isolamento tenant) | P1 | ✅ | `357eff0` (18 casos) |
| **QA-002** (teste webhook Asaas) | P1 | ✅ | `72ce9e5` (10 casos) |
| **QA-003 / COD-002 / OPS-012** (CI sem build) | P1 | ✅ | `cfeb1a5` |
| **QA-004** (teste motor de comissão) | P1 | ✅ | `558954b` (19 casos) |
| **SAAS-001** (audit trail billing/permissão/lifecycle) | P1 | ✅ **Completo** | `d66b521` (billing+papel) + `eb8e60d` (cancel+create) |
| **DB-002** (FKs sem índice) | P1 | ✅ | `a06f67e` — 10 índices (migration aplica no deploy) |
| **PERF-001** (cache de tenant morto) | P1 | ✅ | `b4eb43a` + teste de contrato de chave; invalidação completada |
| **LGPD-003** (erasure não propaga p/ cert) | P1 | ✅ | `843d916` |
| **OBS-001** (sem error-tracking; claim falso) | P1 | ✅ | `743cd55` — beacon `/api/observability/client-log` |
| **OPS-006** (cron reconcile não agendado) | P1 | ✅ **Versionado** | `4263e24` — SQL no fonte. *Aplicar no Supabase = manual sua.* |
| **API-002** (health vaza erro do PG) | P2 | ✅ | `5386fc2` |
| **FE-001** (link morto /admin/webhooks) | P2 | ✅ | `5386fc2` |
| **COD-001** (LMS fora do env schema) | P2 | ✅ | `5718db4` |
| **DB-005** (race getOrCreatePmbTenant) | P2 | ✅ | `5718db4` + teste |
| **QA-008** (regras puras sem teste) | P2 | ✅ | `782e1b3` (roles, slug, forbidden-names — 11 casos) |
| **COD-005** (exports mortos) | P3 | ✅ | `06680fc` |
| **FE-002** (componente órfão) | P3 | ✅ | `06680fc` |
| **FE-004** (rel=noopener) | P3 | ✅ | `06680fc` |

**Total fechado:** 3 P0 (2 causas-raiz) · 11 P1 · 5 P2 · 3 P3. **Testes: 44 → 116.**

## 3. Verificações finais (E2E / dados alterados)

- ✅ `certificates` e `payout-proofs` **privados** no origin (GET anônimo → 400); `vitrine-assets` **público** (logos/banners seguem funcionando — `uploadVitrineAsset` intacto em 10 rotas).
- ✅ **Acesso da revenda ao comprovante** (sua preocupação): rota `/api/painel/indicacoes/proof/[payoutId]` autentica a revenda e checa `referrerTenantId === ctx.tenantId` → stream service-role. UI da revenda linka para ela. (0 comprovantes legados → sem quebra.)
- ✅ **Certificados**: download (admin/painel/aluno) por stream service-role; `/validar` por signed URL 300s — todos funcionam com bucket privado.
- ✅ **Cache de tenant**: chave do proxy = chave do cache (teste trava o contrato); venda segue gateada FRESH no checkout (`TENANT_INACTIVE`) → cache de 60s não vende suspenso.
- ✅ Sem regressões: `swallowCleanup`/`shouldSendEmail`/`/admin/webhooks`/`href={proofUrl}` → 0 referências.
- ✅ Portão Zero-Erro final: tsc=0 · lint=0 · test=0 (116) · build=0.

## 4. Itens ABERTOS — triados (recipe em `achados/*.md`)

### Decisão sua (não executo unilateralmente)
- **SEG-001/DB-003 (RLS)** — arquitetural; mitigado por QA-001. Requer projeto próprio (app conecta como owner; RLS exige mudar o modelo de conexão).
- **LGPD-002** (consentimento de pixels) — muda comportamento de tracking **deliberadamente configurado** (memória do projeto); decisão de produto/jurídico.
- **Aplicar pg_cron OPS-006** + **flip do fluxo de deploy OPS-001** — ações em prod/infra.

### ⚠️MIGRAÇÃO Vercel→VPS (quebrariam a prod atual se aplicados agora — pré-cutover)
OPS-002 (standalone/Docker), OPS-003 (Redis TCP), OPS-004 (proxy Node), OPS-005 (MinIO), OPS-007/008/010/011/013, PERF-008, OBS-006/007, LGPD-005, COD-003.

### Perf em páginas críticas (precisam de feature/UX + invalidação — sem safety net)
PERF-002 (cache da home), PERF-003 (paginação catálogo), PERF-004 (cap leads), PERF-005/006 (batch crons), PERF-007 (N+1 notificações).

### Médio (feature/dados/financeiro)
SAAS-003 (gate Automação server), SAAS-004 (price>0 no checkout vitrine), SAAS-005 (clawback em refund parcial), DB-004 (unique parcial p/ tenantId NULL), API-003 (Zod home-sections), SEG-003 (trocar `xlsx`).

### Doc/observabilidade/processo
OBS-002 (DR/runbooks), OBS-003/004/005 (logs cron/métricas/uptime), LGPD-004 (ROPA), QA-006 (E2E), QA-007 (coverage thresholds).

### P3 menores
SEG-002 (CSP nonce), SEG-004 (remover dep `mercadopago`), SEG-005 (Dependabot), SEG-006, DB-007/008, COD-004/006, API-004/005, SAAS-006/007, OBS-008, FE-003, LGPD-007/008, QA-005/009, PERF-009.

## 5. Já executado por mim sob sua autorização
Flip do bucket `certificates` → privado · criação do bucket privado `payout-proofs` (Supabase Management API).
