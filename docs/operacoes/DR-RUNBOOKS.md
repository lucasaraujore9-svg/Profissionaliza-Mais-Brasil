# Disaster Recovery — RTO/RPO e Runbooks de incidente (OBS-002)

> Objetivo: dar um passo-a-passo acionável para os incidentes prováveis deste
> sistema, com alvos de recuperação acordados **por escrito**. Reduz o MTTR e
> tira a decisão do improviso sob pressão.
>
> Complementa `docs/runbooks/rotacao-de-chaves.md` (rotação de segredos / vazamento).
> Monitoramento/alerta externo que dispara estes runbooks: `docs/operacoes/MONITORAMENTO.md`.
> Centralização/retenção de logs (⚠️MIGRAÇÃO VPS): `docs/operacoes/LOGS-CENTRALIZACAO.md`.

> ⚠️ **Nada aqui é executado por agente automatizado.** São passos de operador
> humano com acesso ao Vercel, ao Supabase e aos painéis das integrações.

---

## 0. RTO/RPO — alvos por componente (PROPOSTA — validar com o dono)

> **Estes números são uma PROPOSTA inicial** para servir de base de discussão.
> O dono do produto precisa **confirmar ou ajustar** cada linha (custo × risco)
> antes de virarem compromisso operacional/contratual.

| Componente | RPO (perda máx. de dados) | RTO (tempo máx. até voltar) | Base técnica atual |
|---|---|---|---|
| **Postgres (Supabase)** | ≤ 5 min *(proposta)* | ≤ 60 min *(proposta)* | Supabase PITR (Point-in-Time Recovery) — granularidade de segundos no plano pago; confirmar retenção contratada |
| **App (Next.js / Vercel)** | 0 (stateless) | ≤ 15 min *(proposta)* | Redeploy/rollback instantâneo na Vercel (revert de commit) |
| **Redis (Upstash)** | tolerante a perda total *(cache/rate-limit efêmeros)* | ≤ 15 min *(proposta)* | Sem dado durável no Redis; app tem fail-open (ver runbook B) |
| **Storage (Supabase Storage / futuro R2)** | ≤ 24 h *(proposta)* | ≤ 4 h *(proposta)* | Bucket de certificados/logos; PDFs regeneram on-demand (ver memória `project_certificados_pdf_freshness`) |
| **Integrações externas (Asaas/MP/EA/LMS)** | 0 no nosso lado | depende do provedor | Webhooks reprocessáveis via `WebhookLog.processed=false` (runbook C) |

**Notas de RPO/RTO:**
- O RPO do Postgres é o único que representa perda real de dados de negócio
  (billing/matrícula). Priorizar validar a retenção de PITR no Supabase.
- O RTO do app é curtíssimo hoje (Vercel). ⚠️MIGRAÇÃO VPS: passa a depender de
  `docker service rollback` + healthcheck (ver runbook E).

---

## 1. Detecção — como um incidente chega até você

1. **`GET /api/health`** (deep check): retorna **503** se o Postgres está fora;
   Redis é informativo (não derruba o 503). Monitor externo deve bater aqui a
   cada 1-2 min — ver `docs/operacoes/MONITORAMENTO.md` (OBS-005, pendente de
   ativação pelo dono).
2. **Notificações in-app** `createNotification(roleTarget: SUPER_ADMIN)`: falhas
   de provisionamento/billing/cron aparecem no sino do `/admin`. Exigem o admin
   abrir o painel (não são push externo — limitação conhecida, OBS-005).
3. **Logs estruturados** (Pino JSON no stdout → Vercel Runtime Logs): buscar por
   `event:"*.failed"`, `event:"*.partial"`, `event:"health.db_check_failed"`.
   `vercel logs <url> --json` é live-tail **sem histórico** (memória
   `reference_logs_vercel_runtime`).

---

## 2. Runbooks de incidente

### Runbook A — Postgres (Supabase) fora / degradado

**Sintoma:** `/api/health` → 503 com `checks.database=false`; erros
`event:"health.db_check_failed"`; app retorna 500 em rotas que tocam o banco.

1. Confirmar no [Supabase Status](https://status.supabase.com) e no dashboard do
   projeto (`jpwskehhnplmmtgyyxmf`) se é indisponibilidade do provedor ou do
   nosso projeto (cota/conexões/pooler).
2. Se **pooler saturado** (Supavisor): checar conexões ativas; a app usa
   `@prisma/adapter-pg` sobre o pooler. Reduzir carga (pausar crons pesados —
   ver runbook F) e aguardar.
3. Se **corrupção/perda de dados** → **restore PITR** (ver §3).
4. Comunicar status; após voltar, validar `/api/health` → 200 e uma compra de
   teste na vitrine PMB.

### Runbook B — Redis (Upstash) fora / cota estourada

**Sintoma:** logs `event:"ratelimit.redis_command_failed"`; possível
personalização de vitrine "sumindo" (marca PMB aparecendo na revenda).

- **Comportamento atual (fail-open resiliente — commit `dcd03fd`):**
  - `src/lib/ratelimit.ts`: buckets `failOpen:true` (auth/checkout/track/beacon)
    **liberam**; demais negam em prod (fail-closed). O `runLimit` captura FALHA
    de comando (não só ausência) — cota estourada não derruba a rota chamadora.
  - `src/proxy.ts`: `resolveTenantFromRedis` cai em `resolveTenantFromDB`
    (`/api/internal/resolve-tenant`) em cache-miss/erro. O proxy é **fail-open**,
    mas o incidente histórico (`project_redis_outage_tenant_resilience`) mostrou
    que se o *fallback de DB também* falhar (ex.: resolve-tenant devolvendo 500
    por rate-limit), a vitrine vaza a marca PMB. Hoje isso está blindado.
- **Ação:** confirmar cota no painel Upstash; se estourada, aumentar plano ou
  rotacionar (ver `rotacao-de-chaves.md` §1.1 `UPSTASH_REDIS_REST_TOKEN`).
  Enquanto isso o login/checkout continuam (fail-open). Após voltar, os logs de
  `proxy.*` (OBS-007) confirmam a fonte de resolução do tenant.

### Runbook C — Webhook Asaas/MP/LMS falhando (fulfillment travado)

**Sintoma:** venda paga mas aluno não matriculado; mensalidade paga mas tenant
não reativado; `WebhookLog.processed=false` acumulando.

1. Causas comuns já documentadas: `MP_WEBHOOK_SECRET` ausente no Vercel;
   `notification_url` no apex causando 307→www (memória
   `project_mp_integration_prod_blockers`). Conferir `rotacao-de-chaves.md` §2.
2. **Reprocessar:** os 3 webhooks são **idempotentes** (Asaas por `asaasPaymentId`;
   MP por `mpPaymentId`; LMS por `externalEventId`). Os processadores gravam
   `WebhookLog.processed=false` na falha e o provedor re-entrega. Para forçar:
   re-disparar a entrega no painel do provedor (Asaas/MP) ou reprocessar a partir
   do `WebhookLog` (id + payload preservados — ver OBS-008 sobre redação de PII).
3. Para o **sweep de reconciliação** que cobre webhooks perdidos: `reactivate-paid`
   (tenants/alunos que voltaram a pagar) e `reconcile-tenant-payments` rodam por
   pg_cron; podem ser disparados manualmente (runbook F).

### Runbook D — Integração EA/LMS caída (catálogo/provisionamento)

**Sintoma:** sync de catálogo falha (`event:"cron.sync_cursos.failed"` /
`cron.sync_cursos_lms.failed`); provisionamento de acesso do aluno não conclui
(`provisioning.ok=false` → alerta SUPER_ADMIN in-app).

1. Confirmar a API do provedor: EA (`EA_API_URL`) / LMS (`GET /api/v1/courses`).
2. Provisionamento é **best-effort com alerta**: o pagamento não é revertido; o
   acesso é reprovisionado quando a integração volta (idempotência por
   Idempotency-Key = id do pagamento). Reprocessar via reenvio do webhook (runbook C).
3. Catálogo: o sync grava a falha em `pushSyncLog` (visível em
   `/admin/catalogo/sync-log`) **e** agora loga no stdout (OBS-003). Após voltar,
   disparar o cron de sync manualmente (runbook F).

### Runbook E — Deploy ruim → rollback

**Hoje (Vercel):**
1. Identificar o deploy problemático (Vercel Dashboard → Deployments) ou o commit
   (release tagging ainda é pendência — OBS-001).
2. **Instant Rollback:** promover o último deploy bom no dashboard, OU
   `git revert <sha>` + push na `main` (a Vercel redeploya via integração GitHub —
   memória `project_prod_deploy_mechanism`).
3. ⚠️ Migrations: `npm run build` roda `scripts/apply-pending-migrations.mjs`
   (idempotente, tracking em `_pmb_applied_migrations`). Um revert de código **não
   reverte** uma migration já aplicada — se o deploy ruim aplicou uma migration,
   avaliar a reversão dela separadamente (toda migration deve ter `down`; **não**
   aplicar reversão destrutiva sem aprovação do dono).

**⚠️MIGRAÇÃO VPS (Docker Swarm):**
- Rollback passa a ser `docker service rollback <serviço>` (usa a
  `--rollback-config` do Swarm). Exige healthcheck no serviço (o `/api/health`
  vira o healthcheck do container) e `output:'standalone'` no Next.
- Não há "Instant Rollback" da Vercel — manter as N imagens anteriores no registry.

### Runbook F — Crons silenciosamente mortos

**Sintoma:** efeitos que deveriam acontecer não acontecem (alunos pagos seguem
bloqueados; inadimplentes seguem com acesso; catálogo desatualizado) — sem erro
visível. Incidente histórico: **TODOS os jobs falharam de 30/04 a 10/06** sem
ninguém perceber (memória `project_cron_scheduling_ambiguo`; causa: `pg_net`
mudou para o schema `net`; fix na migration `20260610`).

1. **Agendamento:** os crons rodam via **Supabase pg_cron** (`app_internal.run_cron`
   faz `net.http_post` para as rotas `/api/cron/*`). Fonte versionada:
   `prisma/sql/pg_cron_jobs.sql`. O corpo HTTP é **descartado** pelo pg_cron —
   por isso a instrumentação de log (OBS-003) é a única visibilidade.
2. **Verificar saúde:** no Supabase, `select * from cron.job;` e
   `select * from cron.job_run_details order by start_time desc limit 50;` —
   procurar `status='failed'` ou ausência de execuções recentes.
3. **Disparar manualmente** (via Management API / `app_internal.run_cron`, já que
   os segredos Sensitive não são puláveis via `vercel env pull` — memória
   `project_sensitive_env_not_pullable`): chamar a rota do cron com o
   `CRON_SECRET` (`Authorization: Bearer` ou o mecanismo de `isCronAuthorized`).
4. Após OBS-003, cada um dos 5 sweeps/syncs loga
   `event:"cron.<nome>.done|partial|failed"` e notifica SUPER_ADMIN em falha
   parcial — usar esses eventos para confirmar recuperação.

### Runbook G — Colapso de gateway revenda→PMB

**Sintoma:** venda de uma revenda caindo na conta Asaas/MP da PMB (roteamento
errado). Incidente real remediado em 2026-06-30 (memória
`project_gateway_isolation_collapse`).

1. Detecção/remediação automatizada existe: **`/api/cron/fix-gateway-collapse`**
   (aceita GET+POST via `run_cron`) — recheca cada cobrança suspeita, ignora as
   já pagas, apaga as órfãs não pagas e registra tudo em `audit_logs` +
   `contextLogger`.
2. Rodar em **modo dry-run primeiro** (se suportado pelo endpoint) para revisar o
   diff antes do `apply`. Confirmar `collapsed_remaining=0` ao final.
3. Blindagem preventiva já deployada: roteamento por `Student.tenantId` +
   asserts + `motherAsaasKey` (commits `8541afd`/`9a6adf9`).

---

## 3. Restore do Postgres (Supabase PITR) — drill documentado

> O restore propriamente (mecânica de banco) cruza com a auditoria de **banco**.
> Aqui fica o procedimento de DR e o **registro do drill**.

**Procedimento (Supabase PITR):**
1. Supabase Dashboard → Database → **Backups / Point in Time**. Escolher o
   timestamp alvo (respeitando o RPO ≤ 5 min proposto).
2. Preferir restaurar para um **projeto/branch de staging** primeiro (validar
   integridade) antes de qualquer restore destrutivo em produção.
3. ⚠️ **Restore em produção é destrutivo** (sobrescreve o estado atual) — **exige
   aprovação explícita do dono**. Nunca executar por conta própria.
4. Pós-restore: rodar `/api/health`, conferir contagens críticas
   (tenants/enrollments/payments) e reprocessar webhooks da janela perdida (runbook C).

**Cadência do drill:** trimestral *(proposta — validar com o dono)*.

**Registro de drills executados:**

| Data | Executor | Escopo (staging/prod) | RPO real observado | Resultado | Observações |
|------|----------|-----------------------|--------------------|-----------|-------------|
| _(pendente)_ | — | — | — | — | Nenhum drill de restore registrado até 2026-07-03. **Ação do dono:** agendar o primeiro drill em staging. |

---

## 4. Pendências que dependem do dono (não implementáveis só no repo)

- **Confirmar RTO/RPO** da §0 (hoje são PROPOSTA).
- **Ativar monitor de uptime externo** apontando para `/api/health` (OBS-005) —
  ver `docs/operacoes/MONITORAMENTO.md`.
- **Executar e registrar o primeiro drill de restore** (§3).
- **Error-tracking dedicado / release tagging** (OBS-001) — decisão de adotar
  Sentry vs GlitchTip self-hosted.
- **Stack de logs própria** para a ⚠️MIGRAÇÃO VPS (OBS-006) — ver
  `docs/operacoes/LOGS-CENTRALIZACAO.md`.
