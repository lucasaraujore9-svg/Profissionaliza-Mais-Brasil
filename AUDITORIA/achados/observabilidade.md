# Auditoria — Observabilidade
_Data: 2026-06-20T17:07:21Z · Referência: .claude/skills/auditoria-saas/references/05-observabilidade.md · Itens do inventário cobertos: 22/22 relevantes_

## Resumo
- Itens verificados: 22 · Achados: P0=0 P1=2 P2=4 P3=2 · Nota do domínio: **6.5/10**
- Logs estruturados (Pino JSON no stdout) e redação de PII estão **muito bem implementados**: zero `console.*` cru em route handlers, redact paths abrangentes (CPF/CNPJ/token/senha/cartão/headers), serializer de erro, AsyncLocalStorage com requestId/tenantId, adoção em 259/280 route handlers. WebhookLog persiste tudo com headers redactados. Os buracos são de **error-tracking** (Sentry ausente, e os error boundaries mentem "já fomos notificados"), **tracing/métricas operacionais** (inexistentes), **observabilidade de jobs unattended** (5/13 crons sem log) e **DR/runbooks** (RTO/RPO não definidos por escrito).

## Achados

### [OBS-001] Sem error tracking (Sentry/equivalente) — error boundaries afirmam "já fomos notificados" sem nada por trás
- **Severidade:** P1
- **Status:** Aberto
- **Local:** `src/app/error.tsx:13-20` · `src/app/global-error.tsx:11-17` · `src/lib/logger-client.ts:5-8` · `package.json:47,78` (só `pino`/`pino-pretty`, nenhum `@sentry/*`)
- **Evidência:** `package.json` não tem nenhuma dependência de error tracking (grep por `sentry|datadog|opentelemetry|bugsnag|rollbar` = NONE). Os dois error boundaries chamam apenas `clientLogger.error(...)`, que (por `logger-client.ts:5-8`: "pode ser encaminhado a um endpoint /api/internal/log via beacon (**não implementado aqui**)") escreve **só no console do browser do próprio usuário**. Não existe rota `/api/internal/log` (`find src/app/api/internal` → só `resolve-tenant`). Ainda assim, `error.tsx:30` exibe "Já fomos notificados e estamos olhando" e `global-error.tsx:42` "Já fomos notificados" — afirmação falsa: ninguém é notificado de erros não tratados no client. No server, erros não tratados só vão para stdout (Vercel Runtime Logs), sem agregação/alerta/release-tagging.
- **Impacto:** O time descobre bugs de produção pelo cliente reclamando (exatamente o cenário que a referência marca como P1). Sem release tagging nem source maps em serviço de tracking, regressões pós-deploy ficam invisíveis até virarem ticket. A mensagem "já fomos notificados" cria expectativa falsa no usuário (e, indiretamente, é desinformação ao titular sob a ótica de transparência).
- **Correção:**
  1. Adotar Sentry (ou GlitchTip self-hosted, alinhado à ⚠️MIGRAÇÃO para VPS): `npm i @sentry/nextjs`, rodar `npx @sentry/wizard@latest -i nextjs`, configurar `sentry.client.config.ts`/`sentry.server.config.ts`/`sentry.edge.config.ts` com `dsn` via env (`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`), `tracesSampleRate`, `release` = `process.env.VERCEL_GIT_COMMIT_SHA`, e upload de source maps no build (`SENTRY_AUTH_TOKEN`).
  2. Em `src/app/error.tsx` e `src/app/global-error.tsx`, chamar `Sentry.captureException(error)` no `useEffect` (mantendo o `clientLogger.error`). Só então a frase "já fomos notificados" passa a ser verdadeira.
  3. Reportar erros server não tratados via `onRequestError` (Next 15+) em `src/instrumentation.ts` → `Sentry.captureRequestError`.
  4. Configurar PII scrubbing no Sentry (`beforeSend`) reaproveitando a lista de `REDACT_PATHS` de `src/lib/logger.ts:45-103` para não enviar CPF/token ao tracker.
  5. Enquanto o item 1 não entra, **corrigir a copy** dos dois boundaries para não afirmar notificação inexistente (ex.: "Registramos o código abaixo — informe-o ao suporte se persistir").
- **Verificação:** Forçar um erro em rota de staging e confirmar o evento no painel Sentry com `release` correto e CPF/token redactados; `grep -r "@sentry" package.json` retorna match.

### [OBS-002] DR sem RTO/RPO definidos, sem runbooks de incidente e sem drill de restore documentado
- **Severidade:** P1
- **Status:** Aberto
- **Local:** `docs/` (sem arquivo de DR) — `grep -rniE "RTO[:=]|RPO[:=]|disaster recovery|runbook|tempo de recuperação"` no repo retorna apenas menções incidentais (ex.: `audit/agent-reports/03-supabase-rls.md:146` cita "disaster-recovery" de passagem; `docs/architecture/ADR-001:143` é outro assunto). `find` por `*runbook*|*incident*|*disaster*|*recovery*` = NONE.
- **Evidência:** Não há nenhum documento com RTO/RPO escritos, nem runbook para os cenários prováveis (banco fora, Redis fora, integração caída — Asaas/MP/EA/LMS, deploy ruim → rollback). O histórico do projeto é rico em incidentes que exigiriam runbook: crons mortos por ~6 semanas sem ninguém notar (memória `project_cron_scheduling_ambiguo`), outage do Redis derrubando login e vazando marca PMB (memória `project_redis_outage_tenant_resilience`), `MP_WEBHOOK_SECRET` ausente travando fulfillment (memória `project_mp_integration_prod_blockers`). Backup/restore: a referência aponta cruzamento com a auditoria de banco; aqui registra-se a ausência do **drill documentado**.
- **Impacto:** Em incidente real (banco fora, deploy quebrado), não há passo-a-passo nem alvo acordado de quanto tempo até voltar / quanto dado pode-se perder — decisões improvisadas sob pressão, MTTR maior, risco de perda de dados de billing/matrícula. A referência marca ausência de runbook como P2, mas "alta dado o histórico de incidentes" → elevado a P1 por causa do histórico documentado deste projeto.
- **Correção:** Criar `docs/operacoes/DR-RUNBOOKS.md` com: (a) RTO/RPO por componente (app, Postgres, Redis, Storage) acordados por escrito; (b) runbooks para — Postgres fora, Redis/Upstash fora (referência ao fail-open atual + reativação), webhook Asaas/MP falhando, integração EA/LMS caída, deploy ruim → procedimento de rollback (Vercel → revert + redeploy; pós-⚠️MIGRAÇÃO → `docker service rollback`), crons silenciosamente mortos (como detectar via `/api/health` + monitor); (c) procedimento e cadência do **drill de restore** do backup Postgres (Supabase PITR), com data do último teste registrado. Cruzar com a referência de banco para o restore propriamente.
- **Verificação:** `docs/operacoes/DR-RUNBOOKS.md` existe, lista RTO/RPO numéricos e ao menos 5 runbooks, e registra a data de um restore-drill executado.

### [OBS-003] 5 de 13 crons rodam sem logging estruturado nem alerta — falhas em jobs unattended ficam invisíveis
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `src/app/api/cron/reactivate-paid/route.ts` · `src/app/api/cron/sweep-students-overdue/route.ts` · `src/app/api/cron/sweep-students-expired/route.ts` · `src/app/api/cron/sync-cursos/route.ts` · `src/app/api/cron/sync-cursos-lms/route.ts`
- **Evidência:** Estes 5 handlers não importam `@/lib/logger` nem `withRequestContext`/`runWithRequestContext` (os outros 8 crons importam). Eles acumulam falhas num array `result.errors[]` retornado no corpo HTTP (ex.: `reactivate-paid/route.ts:71`, `:117`; `sweep-students-overdue/route.ts:137`), mas como o agendamento é via Supabase pg_cron (`prisma/sql/pg_cron_jobs.sql`), o corpo da resposta é descartado — não há log line nem notificação SUPER_ADMIN. `sync-cursos/route.ts:15-21` engole a exceção num `catch` que só retorna 502 (sem `logger.error`); `src/lib/catalog/sync.ts` não tem nenhuma chamada de logger (grep = 0).
- **Impacto:** Reproduz exatamente o incidente histórico em que "TODOS os jobs falharam de 30/04 a 10/06" sem ninguém perceber (memória `project_cron_scheduling_ambiguo`). Se `reactivate-paid`/`sweep-students-overdue` falharem, alunos pagos seguem bloqueados ou inadimplentes seguem com acesso, e isso só aparece via reclamação. Sem log, não há como diagnosticar nem alertar.
- **Correção:** Padronizar todos os 13 crons no wrapper de observabilidade: envolver o handler em `withRequestContext({ action: "cron.<nome>", route: "..." }, ...)` e, ao final, `contextLogger().info({ event: "cron.<nome>.done", ...result })`; quando `result.errors.length > 0`, emitir `contextLogger().error({ event: "cron.<nome>.partial", errorCount, sampleErrors })` **e** disparar `createNotification({ audience:"ROLE", roleTarget:"SUPER_ADMIN", level:"ERROR", category:"cron" })` (mesmo padrão já usado em `src/lib/enrollment/fulfill.ts:766-778`). Em `sync-cursos`/`sync-cursos-lms`, logar no `catch` antes do 502 e adicionar logs em `src/lib/catalog/sync.ts`.
- **Verificação:** `for f in src/app/api/cron/*/route.ts; do grep -L "withRequestContext\|runWithRequestContext\|@/lib/logger" "$f"; done` retorna vazio; simular falha em um sweep e confirmar log `*.partial` + notificação SUPER_ADMIN.

### [OBS-004] Sem métricas operacionais (latência/erro/throughput) e sem tracing distribuído
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `package.json` (sem `prom-client`/`@opentelemetry/*`/`@vercel/otel`) · `src/app/api/metrics/public/route.ts` (é métrica de **negócio**, não operacional)
- **Evidência:** A única rota "metrics" do projeto, `src/app/api/metrics/public/route.ts:8-12`, expõe contagem de revendas/cursos/alunos para o marketing da landing — não há `/metrics` Prometheus, nem coleta de latência/taxa de erro/throughput por endpoint, nem instrumentação OpenTelemetry ligando request → DB/Redis/Asaas/MP/EA/LMS. `src/instrumentation.ts` só valida env no boot; não registra nenhum tracer. `health/route.ts:62` retorna `latencyMs` do próprio health, mas isso não é coletado/agregado.
- **Impacto:** Quando "está lento", não há onde olhar para saber se é DB, Redis, ou uma das 4 integrações externas. Sem taxa de erro por endpoint, regressões de performance e picos de 5xx passam despercebidos. A referência marca ambos como P2.
- **Correção:** (a) Métricas: adotar `@vercel/otel` (hoje) ou expor `/api/metrics` com `prom-client` (alinhado à ⚠️MIGRAÇÃO para Prometheus/Grafana na VPS) cobrindo histograma de latência e contador de erros por rota; (b) Tracing: instalar `@opentelemetry/*`, registrar tracer em `instrumentation.ts`, instrumentar Prisma (`@prisma/instrumentation`), o cliente Upstash e os fetchs de Asaas/MP/EA/LMS, exportando para o coletor (OTLP → Grafana Tempo/Jaeger na VPS). Aproveitar o `requestId` do `request-context.ts` como trace correlation id.
- **Verificação:** `/api/metrics` retorna métricas no formato Prometheus com séries por rota; uma compra de teste gera um trace ponta-a-ponta (request → DB → MP) no backend de tracing.

### [OBS-005] Sem monitor de uptime nem alertas acionáveis configurados/documentados
- **Severidade:** P2
- **Status:** Aberto
- **Local:** repo inteiro (sem config de Uptime Kuma/UptimeRobot/Better Uptime) · `src/app/api/health/route.ts` (endpoint existe e é bom, mas nada o consome) · `vercel.json` (`{"crons":[]}`)
- **Evidência:** `src/app/api/health/route.ts` é um health check profundo correto (checa DB com `SELECT 1` → 503 se falha; Redis informativo), mas não há nenhuma evidência no repo de um monitor externo apontando para ele, nem doc descrevendo o alerta (e-mail/Telegram/WhatsApp). Os alertas existentes são apenas **in-app** via `createNotification(roleTarget:"SUPER_ADMIN")` para falhas de provisionamento (`src/lib/enrollment/fulfill.ts`, `src/lib/mercadopago/process.ts:265`) — exigem o admin abrir o painel; não há push proativo para canal externo quando o app/DB cai.
- **Impacto:** Se o app/DB cair fora do horário comercial, ninguém é avisado até um usuário reclamar. Os alertas de provisionamento dependem do SUPER_ADMIN entrar no painel — não funcionam para o cenário "app fora do ar".
- **Correção:** (a) Configurar monitor de uptime (Uptime Kuma self-hosted, alinhado à ⚠️MIGRAÇÃO) batendo em `GET /api/health` a cada 1-2min, com alerta para canal externo (Telegram/WhatsApp/e-mail) em 503/timeout; documentar em `docs/operacoes/`. (b) Adicionar um canal externo (e-mail Resend já disponível, ou webhook Telegram) para notificações SUPER_ADMIN de nível ERROR, para que falhas críticas de provisionamento/cron não dependam de login no painel. (c) Definir limiares acionáveis (taxa de erro, latência p95) uma vez que OBS-004 esteja no ar.
- **Verificação:** Monitor externo registrado batendo em `/api/health`; derrubar o DB em staging dispara alerta no canal externo em < 2min.

### [OBS-006] Centralização de logs depende de Vercel Log Drains — quebra na migração para VPS/Swarm
- **Severidade:** P2 (⚠️MIGRAÇÃO)
- **Status:** Aberto
- **Local:** `src/lib/logger.ts:144-181` (comentário "Vercel Log Drain leva pra qualquer aggregator") · `src/lib/observability/log-transport.ts:1-31` (transport HTTP opcional, hoje no-op sem `AXIOM_TOKEN`) · memória `reference_logs_vercel_runtime` (Pino JSON no stdout, sem Axiom em prod)
- **Evidência:** Hoje os logs vão para stdout e a agregação/retenção é delegada ao Vercel Runtime Logs / Log Drains (não há `AXIOM_TOKEN`/`AXIOM_DATASET` setados em prod conforme memória, então `createHttpLogStream()` retorna `null` e o app fica só em stdout). `vercel logs` é live-tail sem histórico (memória). Na ⚠️MIGRAÇÃO para Docker Swarm não existe Vercel Log Drain — sem uma stack própria, os logs morrem no stdout do container sem retenção nem busca.
- **Impacto:** Pós-migração, o sistema fica **sem histórico de logs** e sem busca — debugging de incidentes passados torna-se impossível. Como o app já não tem error tracking (OBS-001), perder também a retenção de stdout deixaria a observabilidade em quase zero no Swarm.
- **Correção:** Antes do corte para VPS, subir stack de logs própria — **Loki + Promtail/Alloy + Grafana** (ou Vector → Loki) coletando o stdout dos containers Docker, com retenção definida por escrito (ex.: 30-90 dias). O `log-transport.ts` já está pronto para fan-out HTTP via `AXIOM_URL` Axiom-compatible — pode apontar para um endpoint Loki/Vector ou ser substituído pelo driver de log do Docker. Definir retenção e índices (labels: `service`, `env`, `tenantId`, `requestId`).
- **Verificação:** Em staging-Swarm, um log emitido pelo app aparece pesquisável no Grafana/Loki com label `requestId`; política de retenção configurada e documentada.

### [OBS-007] Edge runtime (proxy multi-tenant) sem nenhuma observabilidade própria
- **Severidade:** P3
- **Status:** Aberto
- **Local:** `src/proxy.ts` (sem `console.*` nem logger — grep por `console.|log` = 0) · contraste com `src/app/api/internal/resolve-tenant/route.ts:94` que loga via `contextLogger().error`
- **Evidência:** O proxy roda no Edge e (corretamente) não pode importar Pino (`src/lib/logger.ts:23-24` documenta isso). Mas ele também não emite **nenhum** log Edge-safe (`console.warn(JSON.stringify(...))`) nas decisões críticas: cache hit/miss de tenant, fail-open quando o Redis está fora, fallback para `resolve-tenant`, tenant não encontrado. A rota de fallback `resolve-tenant` loga, porém as decisões tomadas no próprio Edge ficam invisíveis.
- **Impacto:** O incidente documentado de outage do Redis que fez o proxy fail-open e **vazar a marca PMB nas vitrines de revenda** (memória `project_redis_outage_tenant_resilience`) não deixaria nenhum rastro no Edge — diagnóstico só foi possível por inferência. Sem log Edge, regressões de roteamento multi-tenant (P0-adjacentes) são cegas.
- **Correção:** No `src/proxy.ts`, adicionar logging Edge-safe (`console.warn`/`console.error` com `JSON.stringify({level,event,host,time,...})`, sem PII — apenas host/slug/decisão), seguindo o padrão já usado em `src/lib/redis.ts:11` e `src/lib/redis/cache.ts:24`. Logar pelo menos: tenant resolvido por qual fonte (cache/db/fallback), eventos de fail-open quando Redis indisponível, e tenant-not-found.
- **Verificação:** Simular Redis fora em staging e confirmar uma linha JSON `{event:"proxy.tenant.failopen", host:...}` nos logs do Edge.

### [OBS-008] WebhookLog persiste payload bruto com PII (nome/email/CPF/CNPJ do Asaas) no banco — sem mascaramento
- **Severidade:** P3 (cruza com LGPD/retenção)
- **Status:** Aberto
- **Local:** `src/app/api/webhooks/asaas/route.ts:130` e `:209` (`payload: body as never`) · model `WebhookLog` (INVENTARIO.md) · retenção em `src/app/api/cron/cleanup-webhook-logs/route.ts` (90 dias)
- **Evidência:** Os webhooks gravam o **corpo bruto inteiro** em `WebhookLog.payload`. Os headers são bem redactados (`asaas/route.ts:23-41` mascara `asaas-access-token`; `mercadopago/route.ts:19-36` mascara `x-signature`), mas o payload do Asaas contém o objeto `customer` completo (nome, email, CPF/CNPJ, telefone) e dados de pagamento, armazenados em claro no Postgres. Isto NÃO vaza para stdout (os log messages só carregam ids — bem feito), mas é **PII em repouso** no banco. CLAUDE.md instrui "logar TUDO em webhook_logs", então é intencional; a retenção de 90 dias mitiga (`cleanup-webhook-logs/route.ts:RETENTION_DAYS=90`). O logger redactaria CPF/CNPJ se passados como campo (`logger.ts:84-90`), mas `payload` vai direto ao Prisma, fora do pipeline do Pino.
- **Impacto:** Dado pessoal sensível (CPF) fica em claro por até 90 dias numa tabela de log; em incidente de acesso ao DB, expõe titulares. Risco de observabilidade/LGPD, não de stdout.
- **Correção:** Avaliar mascarar campos de PII (`customer.cpfCnpj`, `customer.email`, `customer.phone`) no `payload` antes de persistir em `WebhookLog` (mantendo o suficiente para troubleshooting — ids, status, valores), reutilizando uma função de redação dedicada; ou cifrar a coluna `payload`. Confirmar a política de retenção de 90 dias no inventário de dados/RoPA (handoff para a auditoria `lgpd`). Manter `processed:false` fora da purga já está correto.
- **Verificação:** Inserir um webhook Asaas de teste e confirmar que o `payload` salvo não contém CPF/email/telefone em claro (ou está cifrado); RoPA documenta a retenção de 90 dias.

## Cobertura
_Itens do inventário relevantes ao domínio Observabilidade e veredito de cada um._

### Infra de logging / lib
- `src/lib/logger.ts` (Pino server, redact, serializers, contextLogger, logAndRethrow) — **OK** (referência, modelo de boa implementação)
- `src/lib/logger-client.ts` (logger client, sanitize PII) — **Achado OBS-001** (beacon `/api/internal/log` documentado mas não implementado; só console do browser)
- `src/lib/observability/request-context.ts` (AsyncLocalStorage, requestId/tenantId) — **OK**
- `src/lib/observability/with-request-context.ts` (wrappers de route handler) — **OK**
- `src/lib/observability/log-transport.ts` (fan-out HTTP Axiom-compatible, opcional) — **Achado OBS-006** (no-op sem env; depende de Log Drain → ⚠️MIGRAÇÃO)
- `src/lib/errors.ts` (`swallow`/`swallowCleanup` logam o erro engolido) — **OK**
- `src/lib/redis.ts:11`, `src/lib/redis/cache.ts:24,57`, `src/lib/env.ts:181,190` (console.* Edge-safe/boot) — **OK** (estruturado JSON, dev-only/boot, sem PII, justificado por Edge/import-circular)
- `src/lib/audit.ts` (`logAudit` / audit trail de operações sensíveis) — **OK** (existe; auditoria detalhada de cobertura do audit trail é do domínio `saas`)
- `src/instrumentation.ts` (register/boot, valida env, fail-fast em prod) — **OK** (mas não registra tracer → ver OBS-004)

### Health check
- `src/app/api/health/route.ts` (deep health: DB `SELECT 1`→503, Redis informativo, latencyMs) — **OK** (endpoint correto; falta um consumidor → OBS-005)

### Error boundaries / telas de erro
- `src/app/error.tsx` — **Achado OBS-001** (afirma "já fomos notificados" sem tracking)
- `src/app/global-error.tsx` — **Achado OBS-001**
- `app/(main)/error.tsx`, `admin/error.tsx`, `aluno/error.tsx`, `painel/error.tsx`, `loja/error.tsx` (5 `error.tsx` por área, INVENTARIO.md) — **Achado OBS-001** (mesmo padrão: sem captura para tracker; verificar cópia)

### Logging em route handlers / webhooks
- `src/app/api/webhooks/mercadopago/route.ts` (requestContext + logger + WebhookLog + headers redactados) — **OK**
- `src/app/api/webhooks/asaas/route.ts` (idem) — **OK** para stdout; **Achado OBS-008** quanto a PII no `payload` persistido
- 259/280 route handlers usando `withRequestContext`/`runWithRequestContext` — **OK** (adoção forte)
- 15 route handlers sem logger nem requestContext (`grep`): dos quais 5 são crons → **Achado OBS-003**; os demais (`auth/[...nextauth]`, `push/devices`, `vitrine/manifest`, `placar/stream`, alguns admin/painel CRUD) — **N/A** (handlers triviais/delegam; não-críticos para observabilidade) ou cobertos por outros domínios
- `src/app/api/metrics/public/route.ts` — **OK** como rota (mas é métrica de negócio, não operacional → contexto de OBS-004)

### Crons (13)
- `cleanup-webhook-logs`, `reconcile-tenant-payments`, `referral-monthly-payout`, `sweep-abandoned-leads`, `sweep-tenants-overdue`, `sweep-visitor-events`, `sync-day-update-lms`, `sync-progresso` (8) — **OK** (logam via logger/requestContext)
- `reactivate-paid`, `sweep-students-overdue`, `sweep-students-expired`, `sync-cursos`, `sync-cursos-lms` (5) — **Achado OBS-003**

### Edge runtime
- `src/proxy.ts` (roteamento multi-tenant Edge) — **Achado OBS-007** (sem logging Edge-safe)
- `src/app/api/internal/resolve-tenant/route.ts` (fallback do proxy, loga) — **OK**

### Alertas
- `createNotification(roleTarget:"SUPER_ADMIN")` em falhas de provisionamento (`src/lib/enrollment/fulfill.ts:350,424,628,650,754,772,898`; `src/lib/mercadopago/process.ts:265,307`) — **OK** (alerta in-app existe e é abundante); **Achado OBS-005** quanto a canal externo/proativo

### Métricas e tracing
- Dependências/instrumentação OTel/Prometheus — **Achado OBS-004** (inexistentes)

### Error tracking
- Sentry/equivalente no client e server, source maps, release tagging — **Achado OBS-001** (ausente)

### DR / confiabilidade
- RTO/RPO escritos — **Achado OBS-002** (ausentes)
- Runbooks de incidente — **Achado OBS-002** (ausentes)
- Drill de restore documentado — **Achado OBS-002** (ausente; restore propriamente é do domínio `banco`)

### Centralização / retenção de logs
- Vercel Log Drains / stack de logs própria — **Achado OBS-006** (⚠️MIGRAÇÃO)
- Retenção WebhookLog (90 dias via `cleanup-webhook-logs`) — **OK** (mitiga OBS-008)
