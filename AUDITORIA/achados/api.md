# Auditoria — API e Integrações
_Data: 2026-07-03 · Referência: .claude/skills/auditoria-saas/references/07-api-integracoes.md · Itens do inventário cobertos: 309/309 route handlers (406 métodos) + 5 clients de integração (Asaas, MP, LMS, EA/plataforma-cursos, WAHA/wa-client) + Vercel client + transient + 17 crons + 3 webhooks (Asaas, MP, LMS)_

## Resumo
- Itens verificados: 309 route handlers, 5 integration clients + Vercel client + transient, 17 crons, 3 webhooks, helpers de URL/auth/env.
- Achados: **P0=0 · P1=0 · P2=1 · P3=5** · Nota do domínio: **9.0/10**
- **Correção (2026-07-03):** API-009 (P2) **Corrigido** · API-004 (P3) **Corrigido** · API-005 (P3) **Corrigido** · API-008 (P3) **Corrigido** · API-010 (P3) **Corrigido** · API-007 (P3) **Aberto/deferido** (mesma receita de PERF-010 — resolver na rodada de performance).
- **Re-verificação dos achados de 2026-06-24:** API-004 (P3) **Aberto** (inalterado), API-005 (P3) **Aberto** (inalterado), **API-006 (P3) CORRIGIDO** (o receiver agora deriva chave de idempotência determinística via `lmsDedupKey` quando o header falta), API-007 (P3) **Aberto e PIOR** (o novo evento `course.updated` virou um 3º gatilho de re-sync completo por evento), API-008 (P3) **Aberto** (inalterado).
- **Novos achados:** **API-009 (P2)** — os endpoints públicos de parcelas (`loja/checkout/installments`, `checkout/installments`) não têm rate limiting apesar de cada request disparar uma chamada externa ao MP com o token da unidade/PMB (abuso / enumeração de BIN / exaustão de rate-limit do MP). **API-010 (P3)** — `createPreapproval`/`createPreference` retentam em 5xx/timeout sem `X-Idempotency-Key` (janela estreita de assinatura duplicada).

O domínio segue **maduro e endurecido**. Os 3 webhooks têm verificação de assinatura (Asaas token timing-safe; MP HMAC SHA256 + anti-replay; LMS HMAC SHA256 + anti-replay), idempotência forte (advisory lock + dedupe por payment id no MP/Asaas; `externalEventId` @unique no LMS agora com fallback determinístico), clients externos com timeout+retry+backoff, 17 crons protegidos por CRON_SECRET timing-safe e idempotentes, secrets fora do client/repo, credenciais de plataforma (EA + LMS) cifradas em repouso e nunca logadas. O delta de ~45 commits (course.updated, matriz curricular via LMS, importa valor/categoria, curadoria preservada no sync, parcelamento via getInstallments, validação de conexão MP, recompra Payment Brick, /pagar, domain-status) foi auditado item a item. O único achado de risco real do ciclo é o **API-009** (rate-limit ausente nos endpoints de parcelas).

## Achados

### [API-009] Endpoints públicos de parcelas (MP) sem rate limiting — abuso da API do MP / enumeração de BIN
- **Severidade:** P2
- **Status:** Corrigido (2026-07-03)
- **Local:** `src/app/api/checkout/installments/route.ts:18-55` (PMB, 100% público) · `src/app/api/loja/checkout/installments/route.ts:24-73` (vitrine, gated só por header do proxy) · secundário `src/app/api/aluno/comprar/installments/route.ts:24-70` (session-gated)
- **Evidência:** Nenhum dos dois endpoints públicos chama `rateLimit(...)`. Cada POST válido dispara `getCardInstallments(token, { amount, bin })` → **uma chamada externa ao Mercado Pago** (`GET /v1/payment_methods/installments`) usando o access token real da unidade (ou o token PMB em `checkout/installments`, obtido via `getPmbMpAccessTokenAsync()`), com `AbortSignal.timeout(20_000)` por tentativa e até 3 retries. Os endpoints-irmãos do mesmo fluxo de checkout **têm** rate-limit (`RATE_LIMITS.publicCheckout` = 10/60s em `loja/checkout/process`, `checkout/mp/process`, `aluno/comprar/process`; `RATE_LIMITS.publicCupom`, `RATE_LIMITS.cobrancaPayCard`, etc. em `src/lib/ratelimit.ts:180-199`). O `bodySchema` valida `amount` e `bin` (`/^\d{6,8}$/`), mas não limita frequência.
- **Impacto:** Um cliente não autenticado pode marretar esses endpoints. Cada request = 1 chamada externa ao MP com o token da conta → (a) **exaustão do rate-limit da conta MP** da unidade/PMB (o MP passa a devolver 429 e as consultas de parcela dos clientes reais degradam — cai na síntese 1..12, então o checkout não quebra, mas perde a informação de juros reais); (b) **enumeração de BIN** (varrer BINs revela bandeira/emissor e faixas de parcelamento por conta); (c) **amplificação de recursos** — cada request segura uma conexão serverless por até 20s (timeout) + lookup no banco. Não há mudança de estado financeiro nem vazamento de segredo, e há degradação graciosa — por isso P2, não P1.
- **Correção:** Aplicar rate-limit no início dos três handlers, espelhando o padrão dos endpoints-irmãos. Ex.: adicionar em `src/lib/ratelimit.ts` `installments: { name: "installments", limit: 20, windowSec: 60 }` e, no topo de cada handler (após `withRequestContext`, antes do parse):
  ```ts
  const rl = await rateLimit(request, RATE_LIMITS.installments)
  if (!rl.ok) return rateLimitResponse(rl)
  ```
  (import `{ rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"`). Para `loja/checkout/installments`, chavear preferencialmente por `x-tenant-id`/IP; para `checkout/installments` (PMB) e `aluno/comprar/installments`, por IP/sessão. Manter `failOpen` como os demais checkout limiters (não usam failOpen → falha do Redis bloqueia; considerar `failOpen: true` para não derrubar o cálculo de parcela num outage do Redis — cruza `project_redis_outage_tenant_resilience`).
- **Verificação:** Disparar >20 POSTs em 60s para `/api/checkout/installments` (BIN válido) e confirmar 429 a partir do 21º. Teste unitário no estilo de `src/lib/ratelimit` mockando o store; e `grep -L "rateLimit(" src/app/api/**/installments/route.ts` deve retornar vazio após o fix.
- **Correção aplicada (2026-07-03):** Novo bucket `RATE_LIMITS.installments` (`limit: 20, windowSec: 60, failOpen: true`) em `src/lib/ratelimit.ts`. `rateLimit(request, RATE_LIMITS.installments)` + `rateLimitResponse` no topo dos **três** handlers de parcelas (`checkout/installments`, `loja/checkout/installments`, `aluno/comprar/installments`), espelhando os endpoints-irmãos `*/process`. Chaveamento por IP (via `rateLimit(request, ...)`), mesmo padrão dos irmãos. `failOpen: true` porque o cálculo de parcela é apenas enriquecimento de UX que já degrada para a síntese 1..12 — um outage do Upstash não pode piorar o checkout do cliente real (cruza `project_redis_outage_tenant_resilience`, dcd03fd). Teste `src/app/api/checkout/installments/route.test.ts` (429 não chama MP; dentro do limite prossegue). Portão verde: typecheck/lint(0 erro)/build(exit 0, SKIP)/test(356 passed). `grep -L "rateLimit(" src/app/api/**/installments/route.ts` → vazio.

### [API-007] Webhook LMS: `course.updated` vira um 3º gatilho de re-sync COMPLETO do catálogo por evento (amplificação piorada)
- **Severidade:** P3
- **Status:** Corrigido (2026-07-03) — resolvido junto com PERF-010 (rodada performance), num único commit coeso.
- **Correção aplicada:** Sync incremental por evento (ver PERF-010 em `auditoria/achados/performance.md` para o detalhe). `processLmsWebhookEvent` (`src/lib/webhooks/lms-process.ts`) não chama mais `syncCatalogFromLMS("cron")` para os eventos de catálogo: `course.published`/`course.updated` sincronizam só o curso do evento via `syncSingleLmsCourse(slug)` (1 pull do detalhe + 1 upsert) e `course.unpublished` marca só aquele curso INATIVO via `deactivateLmsCourse(courseId)`. Elimina a amplificação O(N²) do webhook por-edição. Testes em `src/lib/webhooks/lms-catalog-webhook.test.ts` confirmam que o `grep` do `syncCatalogFromLMS` completo não aparece mais no caminho de webhook e que N eventos `course.updated` não escalam `listLmsCourses`. Commit: <PENDENTE — mesmo de PERF-010>.
- **Nota (2026-07-03):** Deferido originalmente na rodada de API para evitar conflito; resolvido na rodada de performance conforme planejado.
- **Local:** `src/lib/webhooks/lms-process.ts:152-158` · `src/lib/catalog/sync-lms.ts:93-247`
- **Evidência:**
  ```ts
  // lms-process.ts:152-158
  case "course.published":
  case "course.unpublished":
  case "course.updated": {
    catalogSchema.parse(payload)
    await syncCatalogFromLMS("cron")   // <- sync de TODO o catálogo, não só do curso do evento
    return { ok: true, message: `catálogo sincronizado (${eventType})` }
  }
  ```
  Antes (2026-06-24) só `published`/`unpublished` disparavam o re-sync completo. O commit `d2d3343` adicionou `course.updated`, que o LMS emite a **cada edição** de curso já publicado (preço, categoria, matriz, conteúdo — `LMS_WEBHOOK_EVENTS` em `lms-process.ts:18-27`). `syncCatalogFromLMS` faz `listLmsCourses()` + **1 `getLmsCourse(slug)` por curso** (`sync-lms.ts:99,111-113`) + propagação `ensureCourseForResellers` + `syncCourseLessons` por curso. O receiver processa **síncrono** com `maxDuration=300` (`route.ts:16`).
- **Impacto:** Ineficiência/amplificação, agora num caminho **muito mais frequente** (toda edição vs. só troca de estado de publicação). Uma edição em massa no LMS (N cursos) gera N webhooks, cada um varrendo o catálogo inteiro (≈N chamadas de detalhe cada → O(N²) chamadas ao LMS), podendo estourar o tempo do ack e fazer o LMS **re-tentar** (auto-amplificação). Sem impacto de segurança (HMAC-gated) nem de integridade (sync é idempotente e a curadoria do admin é preservada — ver Cobertura). O comentário em `day-update.ts` sobre "webhook desligado" pode estar desatualizado.
- **Correção:** Em `processLmsWebhookEvent` (case `updated`/`published`/`unpublished`), atualizar **só o curso do evento** por `lmsCourseId`/`lmsSlug` (espelhar o `updateMany` por `lmsCourseId` do `day-update.ts`), ou debouncing: marcar um flag e deixar o cron `sync-cursos-lms` consolidar. Se o payload de `course.updated` trouxer o id/slug do curso, tornar `catalogSchema` estrito para esse evento e sincronizar apenas aquele curso (nova função `syncSingleLmsCourse(slug)`).
- **Verificação:** `grep` confirma que o case não chama mais `syncCatalogFromLMS` completo para `course.updated`; simular 5 webhooks `course.updated` e medir que `listLmsCourses` não escala linearmente com o nº de eventos.

### [API-010] `createPreapproval`/`createPreference` retentam sem `X-Idempotency-Key` (janela estreita de assinatura/preferência duplicada)
- **Severidade:** P3
- **Status:** Corrigido (2026-07-03)
- **Local:** `src/lib/mercadopago/client.ts:132-137` (`createPreference`), `220-225` (`createPreapproval`), `46-103` (loop de retry) · callsites: `src/lib/mercadopago/transparent-process.ts:134` (assinatura MONTHLY), `src/app/api/admin/vendas/route.ts:389,430`, `src/app/api/aluno/comprar/route.ts:542,580`
- **Evidência:** O `request()` genérico retenta em 5xx/rede/timeout (statusCode 0) até 3 vezes (`client.ts:81-99`). `createPayment` passa `X-Idempotency-Key` (`client.ts:153-161`) — protegido. Mas `createPreapproval` (assinatura recorrente) e `createPreference` **não** passam header de idempotência. Se o MP **cria** a preapproval e a resposta se perde (5xx/timeout), o retry gera uma **2ª assinatura autorizada**; só o último `preapproval.id` é gravado em `Enrollment.mpSubscriptionId` (`transparent-process.ts:152-154`), deixando a duplicata órfã porém **cobrando mensalmente**. Para `createPreference` o efeito é inócuo (link de checkout extra). `refundPayment` (MP) também retenta sem idempotência, mas **não tem callsites** (`grep` = só a definição) — sem impacto.
- **Impacto:** Baixo e de janela estreita (só quando o MP commita a assinatura e depois falha a resposta com 5xx/timeout, num fluxo MONTHLY que é minoritário). Consequência: revendedor/aluno com **assinatura duplicada** cobrando em dobro. A referência exige "Idempotência nas chamadas que mutam (não enviar 2x no retry)".
- **Correção:** Adicionar parâmetro `idempotencyKey` a `createPreapproval`/`createPreference` (como em `createPayment`) e passar `X-Idempotency-Key` estável por tentativa de checkout (ex.: `enrollment.id` para a assinatura; `external_reference` para a preference). O endpoint MP de preapproval aceita o header. Alternativa mínima: não retentar `createPreapproval` em 5xx (a criação de assinatura não deve ser retentada cegamente).
- **Verificação:** Teste unitário de `createPreapproval` com mock que responde 502 na 1ª tentativa e 200 na 2ª, garantindo que ambas carregam o mesmo `X-Idempotency-Key`; confirmar que só 1 assinatura é criada no MP (mock conta chamadas com key distinta).
- **Correção aplicada (2026-07-03):** `createPreapproval` e `createPreference` (`src/lib/mercadopago/client.ts`) ganharam parâmetro **obrigatório** `idempotencyKey` (mesmo padrão de `createPayment`), enviado como header `X-Idempotency-Key`. Os 5 call-sites (`transparent-process.ts:134`, `admin/vendas/route.ts:389,430`, `aluno/comprar/route.ts:542,580`) passam o `externalReference` (estável por tentativa de checkout) — no retry de 5xx/timeout o MP dedupe e devolve a MESMA assinatura/preferência (fim da janela de assinatura duplicada cobrando em dobro). Teste `src/lib/mercadopago/client.test.ts` (502→200 reenvia a mesma chave, 1 assinatura; preference envia a chave). `refundPayment` segue sem idempotência mas continua sem callsites (dead code) — não tocado. Portão verde: typecheck/lint(0 erro)/build(exit 0)/test(367 passed).

### [API-004] onboarding-tour aceita corpo silenciosamente com default em vez de validar
- **Severidade:** P3
- **Status:** Corrigido (2026-07-03)
- **Local:** `src/app/api/painel/onboarding-tour/route.ts:24-32`
- **Evidência:** `let dontShowAgain = true; try { const body = ...; if (typeof body?.dontShowAgain === "boolean") dontShowAgain = body.dontShowAgain } catch { /* mantém true */ }`. Corpo ausente/inválido não é rejeitado — assume `true`. Inalterado desde 2026-06-24.
- **Impacto:** Cosmético. Preferência de UI do próprio usuário autenticado; aceitar o default é tolerável, apenas inconsistente com o padrão "valida e 400".
- **Correção:** Opcional — `z.object({ dontShowAgain: z.boolean() })` + 400 em corpo malformado, ou documentar o default como intencional. Efeito inócuo → pode ser **Aceito**.
- **Verificação:** N/A (decisão de padronização).
- **Correção aplicada (2026-07-03):** Aplicada a opção (a). `bodySchema = z.object({ dontShowAgain: z.boolean() })` com `safeParse`; corpo ausente/JSON inválido → 400 `JSON inválido`; corpo sem `dontShowAgain` booleano → 400 `Dados inválidos`. Seguro porque o endpoint **não tem mais caller no client** (a dispensa de tour migrou para `/api/tours/dismiss` + `dismissedTours`); `onboarding-tour` é legado. Teste `src/app/api/painel/onboarding-tour/route.test.ts` (401 sem sessão; 400 malformado/sem campo; grava data em true; null em false). Portão verde: typecheck/lint(0 erro)/build(exit 0)/test(361 passed).

### [API-005] Envelope de erro flat (`{ error, code }`) diverge do formato sugerido pela referência (`{ error: { code, message } }`)
- **Severidade:** P3
- **Status:** Corrigido (2026-07-03)
- **Local:** Convenção global — ex.: `src/app/api/checkout/status/route.ts`, `src/app/api/loja/checkout/status/route.ts`, e centenas de outros handlers.
- **Evidência:** O projeto padroniza `{ data: ... }` no sucesso e `{ error: "mensagem", code?: "CODE" }` (flat) no erro. A referência sugere `{ error: { code, message } }` aninhado + documentação OpenAPI. Inalterado.
- **Impacto:** Nenhum funcional — convenção consistente internamente e sem consumidor externo (API privada; "Ausência de OpenAPI = P2/P3"). P3 de consistência/documentação.
- **Correção:** Decisão de produto: (a) manter a convenção flat e documentá-la em `docs/api/conventions.md` (recomendado), ou (b) migrar para envelope aninhado se surgir consumidor externo.
- **Verificação:** N/A (decisão de padronização/documentação).
- **Correção aplicada (2026-07-03):** Opção (a). Criado `docs/api/conventions.md` documentando o envelope flat `{ error, code }` como convenção canônica (com a decisão explícita de NÃO migrar para o aninhado — API privada, consistente em centenas de handlers), além de sucesso `{ data }`/`{ ok }`, validação Zod, AuthZ, rate-limit e idempotência. Sem mudança de comportamento (doc-only). Portão verde: typecheck/lint(0 erro)/build(exit 0)/test(361 passed).

### [API-008] wa-client (engine WhatsApp/WAHA) lê process.env direto e não tem retry/backoff no envio
- **Severidade:** P3
- **Status:** Corrigido (2026-07-03)
- **Local:** `src/lib/automation/wa-client.ts:23-24,35,378+`
- **Evidência:** (1) Config via `process.env.WA_GATEWAY_URL`/`WA_GATEWAY_API_KEY` direto (linhas 23-24), contrariando a regra do projeto (`src/lib/env.ts`) — e `WA_GATEWAY_*` **não** está no schema de `env.ts` (`grep` = zero; sem fail-fast no boot). (2) `gatewayFetch` tem timeout 15s (AbortController) e degradação graciosa (stop/logout/delete toleram falha), mas `sendTextMessage` (linha 378+) e `startSession` **não** têm retry/backoff: um 5xx transitório do engine no envio falha a mensagem em definitivo (sem reentrega). Inalterado desde 2026-06-24.
- **Impacto:** Baixo. Integração só de SAÍDA (não há webhook inbound do WAHA — `grep` zero). Um blip do engine perde aquele disparo de automação (lead não recebe a mensagem). ⚠️MIGRAÇÃO: na VPS Swarm `WA_GATEWAY_URL` aponta para serviço interno — adicionar ao schema de `env.ts` pega config divergente cedo (lição do 401 por chave divergente da referência). Nota: o **Vercel client** (`src/lib/vercel/client.ts:12-28`) segue o mesmo padrão de `process.env` direto (timeout 15s, sem retry — decisão documentada); menor prioridade, mesma recomendação.
- **Correção:** (1) Adicionar `WA_GATEWAY_URL`/`WA_GATEWAY_API_KEY` (e, no mesmo esforço, `VERCEL_TOKEN`/`VERCEL_PROJECT_ID`/`VERCEL_TEAM_ID`) ao schema de `src/lib/env.ts` (opcionais; warning em prod se a automação/domínio estiver ligada e faltar). (2) Envolver `sendTextMessage` (e opcionalmente `startSession`) em retry com backoff exponencial (2-3 tentativas, só em 5xx/rede/timeout — não em 4xx nem `WhatsAppNumberNotFoundError`), espelhando `lib/lms/client.ts`/`lib/asaas/client.ts`.
- **Verificação:** `grep "process.env.WA_GATEWAY" src` retorna zero; teste unitário de `sendTextMessage` com mock devolvendo 503 na 1ª e 200 na 2ª → 1 mensagem entregue.
- **Correção aplicada (2026-07-03):** (1) `WA_GATEWAY_URL`/`WA_GATEWAY_API_KEY` adicionados ao schema de `src/lib/env.ts` (opcionais, `optionalUrl()`; `VERCEL_*` já estava no schema — nada a fazer lá); `gatewayConfig()` passou a ler via `env.*` (não `process.env`). (2) `sendTextMessage` agora retenta o POST `/api/sendText` em falha **transitória** (5xx / rede / timeout): até 3 tentativas com backoff exponencial (500/1000ms), espelhando `lib/lms/client.ts`; 4xx é terminal (não retenta) e `WhatsAppNumberNotFoundError` é lançado antes do envio. `startSession` deixado como está (idempotente + botão de re-tentar na UI). Teste `src/lib/automation/wa-client.test.ts` (5xx→200 entrega; rede→200 entrega; 4xx não retenta; número sem WhatsApp não dispara POST). `grep "process.env.WA_GATEWAY" src` → vazio. Portão verde: typecheck/lint(0 erro)/build(exit 0)/test(365 passed). ⚠️MIGRAÇÃO: `WA_GATEWAY_*` agora fail-fast no schema; na VPS/Swarm aponta para serviço interno.

## Cobertura

Route handlers e integrações revisados (309/309 handlers + 5 clients + Vercel client + 17 crons + 3 webhooks). Delta de ~45 commits desde 2026-06-24 auditado item a item.

### Webhooks (3/3) — OK
- `api/webhooks/asaas/route.ts` — **OK**. Token timing-safe (`tokensMatch`/`timingSafeEqual`), branch PMB (`ASAAS_WEBHOOK_TOKEN`) vs revenda (`asaasWebhookToken` por-tenant descriptografado), Zod via `parseAsaasWebhookPayload`, slug sanitizado, WebhookLog com token redatado, 200 rápido / 500 para retry, processador idempotente por `asaasPaymentId`. `runtime=nodejs`, `maxDuration=60`.
- `api/webhooks/mercadopago/route.ts` + `lib/mercadopago/{process,webhook}.ts` — **OK**. HMAC SHA256 (manifest `id;request-id;ts`) + anti-replay, early-reject sem x-signature/x-request-id em prod, idempotência em camadas (dedupe `mpPaymentId` → resolve tenant → HMAC por-conta → `getPayment` 404 cross-tenant → advisory lock no fulfill), secret PMB plain vs revenda cifrada, dev-bypass duplo-gated.
- `api/webhooks/lms/route.ts` + `lib/webhooks/{lms-webhook,lms-process}.ts` — **OK / API-007**. HMAC SHA256 sobre `"<ts>.<rawBody>"` com `PMB_WEBHOOK_SECRET`, anti-replay 10min, assinatura validada ANTES de qualquer efeito/log, 503 sem secret. **API-006 CORRIGIDO**: idempotência agora usa `lmsDedupKey(eventId, eventType, rawBody)` (`lms-webhook.ts:79-90`) — quando o header `X-PMB-Event-Id` falta, deriva `sha256:<hash(eventType.rawBody)>` como `externalEventId` (@unique), então re-entrega idêntica sem header **deduplica** (não cria mais ticket de suporte duplicado). **API-007**: `course.published`/`unpublished`/`updated` re-sincronizam o catálogo inteiro inline (agora com `updated` como 3º gatilho por-edição).

### Crons (17/17) — OK
Todos com `isCronAuthorized` (CRON_SECRET timing-safe via `lib/auth/bearer`, rejeita se env ausente) + `maxDuration` + idempotência. GET delega a POST preservando auth. **Novo desde a última auditoria:** `fix-gateway-collapse` (`route.ts:57` `isCronAuthorized`; GET/POST = mesmo `handle`; disparo via `run_cron`) — **OK**. Demais: cleanup-webhook-logs, reactivate-paid, reconcile-tenant-payments, referral-monthly-payout, resync-lms-credentials (dry-run, senha nunca em claro), resync-platform-passwords (dry-run), sync-lms-branding (dry-run), sweep-abandoned-leads, sweep-students-expired, sweep-students-overdue, sweep-tenants-overdue, sweep-visitor-events, sync-cursos (EA), sync-cursos-lms, sync-day-update-lms (delta+cursor), sync-progresso. **OK**.

### Clients de integração (5/5 + Vercel + transient) — OK
- `lib/asaas/client.ts` — timeout 20s/tentativa, retry 3 + backoff exp, não-retry 4xx, `createPayment` mutante (revisar idempotência do Asaas em par com API-010, mas Asaas usa `externalReference`+dedupe no fulfill). **OK**.
- `lib/mercadopago/client.ts` — timeout 20s, retry 3 + backoff, `X-Idempotency-Key` em `createPayment`, token por-tenant descriptografado; **novos**: `getAccountInfo` (`GET /users/me`, valida conexão) e `getCardInstallments` (`GET /v1/payment_methods/installments`, parcelas reais). **OK** quanto a resiliência; **API-010** para `createPreapproval`/`createPreference` (retry sem idempotência). `refundPayment` sem callsites (dead code).
- `lib/lms/client.ts` — timeout 25s, retry 3 + backoff, `Idempotency-Key` em enrollment, Bearer `LMS_API_KEY`, 4xx não-retry. Novos campos de catálogo (`suggestedPriceCents`, `categories`, `curriculum`) tipados. **OK**.
- `lib/plataforma-cursos/client.ts` (EA, form-data!) — timeout 25s, retry 3 + backoff, DELETE via headers, erro de API não-retry. **OK**.
- `lib/vercel/client.ts` — timeout 15s, **sem retry** (decisão documentada; usuário re-tenta manualmente). `getProjectDomain`/`getDomainConfig`/`verifyProjectDomain`/`addProjectDomain`/`removeProjectDomain` usados por `resolveCustomDomainStatus` (aplica domínio só com apex+www verificados E `misconfigured=false`). Lê `process.env.VERCEL_*` direto (nota em API-008). **OK**.
- `lib/automation/wa-client.ts` (WAHA, SAÍDA) — timeout 15s, degradação graciosa. **API-008** (process.env direto + sem retry no envio). Sem webhook inbound (N/A assinatura).
- `lib/webhooks/transient.ts` — classificação transitório vs terminal (MP/Asaas 5xx|0, EA 5xx|sem-status, Prisma P2034/P1001/P1002/P1008/P1017). **OK**.

### Catálogo LMS — sync + curadoria (delta 7be5d7e / 45d8af6 / 9b7fcc4) — OK
- `lib/catalog/sync-lms.ts` — **OK**. **Curadoria preservada (45d8af6):** no update, `status: existing.status` (`sync-lms.ts:195`) impede o sync de reverter INATIVO→ATIVO; `hiddenMain`/`visibilityMode` só definidos no CREATE (`:204`); `categoryId` só definido se ainda não houver principal (`:171`); `precoVitrineMain` (override do admin) nunca é tocado — o sync alimenta só `precoOriginal` (preço-base). **Importa valor+categoria+ativa na rede (7be5d7e):** curso novo com `precoOriginal>0` E ≥1 categoria nasce `hiddenMain=false` e propaga via `ensureCourseForResellers` (best-effort, `:228-235`). **Matriz curricular (9b7fcc4):** `mapCurriculumToMatriz` re-sincroniza `matrizCurricular`; `null` (campo ausente) = não mexe (`:145,158`). `ensureLmsCategory` idempotente por slug/nome. `syncCourseLessons` usa `$transaction([deleteMany, createMany])` (array-form) — mesmo padrão de `fulfill.ts`/`process.ts` que funcionam em prod; **não é achado** (o array-form não é universalmente quebrado; a falha do bulk-edit 019a253 teve causa específica). **OK**.

### Conexão de gateway (delta 236eef0) — OK
`painel/config/connect-mp` — **OK**. Valida o token com `getAccountInfo` (ping `GET /users/me`) antes de gravar: 401/403 → 400 `MP_TOKEN_INVALID` (não grava); 5xx/timeout/429 → 502 `MP_VALIDATION_UNAVAILABLE` (não afirma inválido, não grava); `site_id !== "MLB"` → 400 `MP_ACCOUNT_NOT_BR`. Token e webhookSecret cifrados (`encrypt`). Auth RESELLER + `tenantId`, Zod com refine.

### Recompra Payment Brick / /pagar (delta 81a54ab / 264b113) — OK
`aluno/comprar/process` — **OK**. Rate-limit `publicCheckout`, `requireStudentSession`, Zod, **anti-IDOR** (`enrollment.studentId === session.studentId`, `:91`), guard de estado (ACTIVE/COMPLETED → idempotente; só PENDING paga), `tenant.status==="ACTIVE"`, ramifica ASAAS (conta da unidade) vs MP, `notification_url` via `mpWebhookUrl()`/`asaasWebhookUrl()`. `aluno/comprar/installments` — session-gated, degradação graciosa (API-009 secundário). `aluno/comprar/status` — poller escopado. Página `/aluno/comprar/pagar/[id]` force-dynamic.

### Parcelamento MP (delta 89c8e50 / 4b25a5e / 39da6a7 / e6bb029) — OK / API-009
`checkout/installments` (PMB), `loja/checkout/installments` (vitrine), `aluno/comprar/installments` (recompra) — Zod (`amount` positivo ≤1M, `bin` `\d{6,8}`), degradação graciosa (falha → payerCosts vazio → síntese 1..12), `installments` capado em `MAX_CARD_INSTALLMENTS` no server (`transparent-process.ts:190-193`, ignora o que o browser mandar). **API-009**: faltam rate-limit nos endpoints públicos.

### Domínio próprio (delta a42ccb8) — OK
`painel/dominio/verify` — **OK**. `requireResellerSession`, dispara `verifyProjectDomain` nas 2 variantes (best-effort), decide por `resolveCustomDomainStatus` (`domain-status.ts`: `pointed = verified && misconfigured===false` nas DUAS variantes), grava `domainVerified` + `invalidateTenant`, 502 se a Vercel falhar (não altera flag). `painel/dominio` (set/remove) coberto. Aplica domínio só após os 2 registros DNS apontarem.

### Provisionamento de matrícula (fulfill.ts) — OK
`lib/enrollment/fulfill.ts` — advisory lock por `(gateway, externalPaymentId)`, dedupe `mp/asaasPaymentId`, guard `Payment.tenantId === Enrollment.tenantId` (anti-receita-cruzada), branch EA vs LMS (`createLmsEnrollment` com Idempotency-Key=payment id), credenciais de plataforma cifradas (`lmsSenha=encrypt(...)`, nunca logadas), pacotes mistos, falha parcial LMS alerta+segue. Usa `$transaction([...])` array-form (funciona em prod — pagamentos efetivam). **OK**.

### SSO LMS / suporte / branding — OK
`aluno/curso/[enrollmentId]/acessar` (escopo por `studentId`+status+`provider===LMS`, SSO uso-único TTL 5min); `lib/support/student-support.ts` (ContactMessage roteado por tenant, best-effort); `lib/lms/branding.ts` (best-effort, no-op se LMS off ou tenant `__pmb__`, nunca lança). **OK**.

### Checkout / pagamentos (Zod + rate-limit) — OK / API-009
`loja/checkout` (+process/package/status/installments/checkout-inquiry), `checkout` (+mp/process/package/status/installments/confirmacao/[id]/status/enrollment/[id]), `aluno/comprar` (+process/status/installments), `aluno/pagamentos/verificar`, `cobranca/[paymentId]` (+billing-info/pay-card), `loja/cupom/validar`. Status endpoints escopam por `tenantId` (anti-IDOR); `notification_url` via helpers em todos os call-sites. Endpoints de **process/pay-card/cupom/verificar têm rate-limit**; os de **installments não** (API-009).

### admin/vendas — OK
`src/app/api/admin/vendas/route.ts` — branches MP (preapproval `:389` + preference `:430`) usam `mpWebhookUrl()`; Asaas usa `asaasWebhookUrl()`. `createPreapproval`/`createPreference` sem idempotência no retry (API-010). Bolsa de estudo com rollback. Cap de cupom efetivo. `admin/vendas/[id]/sync-payment` guard admin. **OK**.

### Endpoints públicos (Zod + rate-limit) — OK
`contato`, `leads`, `pmb/leads` (via loja), `loja/leads` (rate-limit `lojaLeads`+`lojaLeadsByEmail`), `loja/track` (`lojaTrack` failOpen), `public/capture-ref`, `public/validate-ref`, `catalogo/sugestoes`, `metrics/public` (ISR), `home/showcase`, `observability/client-log` (rate-limit failOpen + Zod + redação PII), `push/public-key`. **OK**.

### Auth / internal (Zod/token) — OK
`auth/[...nextauth]`, `auth/forgot-password` (`authForgot`), `auth/reset-password` (`authReset`), `auth/alterar-senha-inicial`, `auth/handoff` + `handoff/start` (token uso-único, anti-open-redirect), `internal/resolve-tenant` (`isInternalAuthorized` + rate-limit). **OK**.

### Uploads / Automação / Push / Sub-revendas / Admin(130)+Painel(86) — OK
Uploads (MIME+magic+bytes+dimensões+rate-limit; ⚠️MIGRAÇÃO Storage→MinIO). Automação WhatsApp (guard+gate+sessionName randomizado; **API-008** no client). Push (VAPID; `auth()`+Zod). Sub-revendas (gate de plano server-side). Varredura exaustiva de POST/PUT/PATCH/DELETE dos handlers admin/painel: todos com Zod (`safeParse`/`.parse`) + guard de sessão+role/tenant. Bulk de cursos migrado para updates sequenciais (019a253) — falhas parciais reportadas em `failed[]`. Handlers GET com prisma write = apenas upsert/create idempotente de linha-default. **OK**.

### ⚠️MIGRAÇÃO (Vercel→VPS/Swarm)
- **apex vs www / 307:** call-sites de webhook usam `lib/tenant/urls.ts` (força `www.`). Na VPS+Traefik, garantir redirect apex→www OU host canônico recebendo POST sem redirect.
- **Edge runtime:** nenhum route handler em `src/app/api/**` usa `runtime="edge"` (todos `nodejs`). `src/proxy.ts` é Edge (fora do escopo API).
- **@upstash/redis (REST≠TCP):** `lib/redis` (rate-limit + cache de tenant) — no Swarm trocar por `ioredis`/`redis` TCP ou SRH. **API-009** aumenta a dependência de rate-limit — garantir Redis TCP disponível antes do cutover (ou `failOpen` nos limiters de installments).
- **WAHA / Vercel clients (API-008):** engines/API fora da Vercel; `WA_GATEWAY_URL` e `VERCEL_*` via `process.env` direto — adicionar ao schema de `env.ts` pega config divergente cedo.
- **Segredos por env:** `MP_WEBHOOK_SECRET`, `ASAAS_WEBHOOK_TOKEN`, `PMB_WEBHOOK_SECRET`, `CRON_SECRET`, `INTERNAL_SECRET`, `EA_API_*`, `LMS_API_*`, `WA_GATEWAY_*`, `VERCEL_*` — provisionar TODOS via Docker Swarm secrets; helpers fail-closed retornam 401/503/500 se ausentes. `MP_WEBHOOK_DEV_BYPASS` nunca em prod.
- **Crons:** hoje via Supabase pg_cron (`app_internal.run_cron`). Na VPS, reagendar os 17 jobs batendo nas rotas com `Authorization: Bearer $CRON_SECRET`; os dry-run (`resync-*`, `sync-lms-branding`) com `?write=1` quando reativar.
- **Webhook LMS:** o LMS precisa apontar `PMB_WEBHOOK_URL` para o host canônico (www) e compartilhar `PMB_WEBHOOK_SECRET` (assinatura é sobre rawBody, só o roteamento muda).
