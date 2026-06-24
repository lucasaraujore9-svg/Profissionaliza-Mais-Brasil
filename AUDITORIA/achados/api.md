# Auditoria — API e Integrações
_Data: 2026-06-24 · Referência: .claude/skills/auditoria-saas/references/07-api-integracoes.md · Itens do inventário cobertos: 294/294 route handlers (390 métodos) + 5 clients de integração (Asaas, MP, LMS, EA/plataforma-cursos, WAHA/wa-client) + transient + 16 crons + 3 webhooks (Asaas, MP, LMS)_

## Resumo
- Itens verificados: 294 route handlers, 5 integration clients + transient, 16 crons, 3 webhooks, helpers de URL/auth/env.
- Achados: P0=0 · P1=0 · P2=0 · P3=3 · Nota do domínio: 9.3/10
- **Re-verificação dos achados de 2026-06-20:** API-001 (P1) **CORRIGIDO**, API-002 (P2) **CORRIGIDO**, API-003 (P2) **CORRIGIDO** (já registrado como tal). API-004 e API-005 (P3) permanecem abertos por decisão (inócuos). Nenhum P0/P1/P2 em aberto.
- **Novos achados (3 P3):** API-006 (LMS webhook não exige X-PMB-Event-Id → entrega sem header não é idempotente), API-007 (course.published dispara re-sync completo do catálogo inline por evento — amplificação, HMAC-gated), API-008 (wa-client lê process.env direto + sem retry/backoff no dispatch).

O domínio está **maduro e endurecido**. Os dois achados de risco real do ciclo anterior (API-001 webhook MP perdido no apex; API-002 vazamento de erro de DB no /health) foram fechados. Os 3 webhooks têm verificação de assinatura (Asaas token timing-safe; MP HMAC SHA256 + anti-replay; LMS HMAC SHA256 + anti-replay), idempotência forte (advisory lock + dedupe por payment id; externalEventId @unique no LMS), os clients externos com timeout+retry+backoff (Asaas 20s, MP 20s, LMS 25s, EA 25s; WAHA 15s timeout sem retry), todos os 16 crons protegidos por CRON_SECRET timing-safe e idempotentes, secrets fora do client/repo, credenciais de plataforma (EA + LMS partnerAccess) cifradas em repouso e nunca logadas.

## Achados

### [API-004] onboarding-tour aceita corpo silenciosamente com default em vez de validar
- **Severidade:** P3
- **Status:** Aberto
- **Local:** `src/app/api/painel/onboarding-tour/route.ts:24-33`
- **Evidência:** `let dontShowAgain = true; try { const body = await req.json(); if (typeof body?.dontShowAgain === "boolean") dontShowAgain = body.dontShowAgain } catch { /* mantém true */ }`. Body inválido ou ausente não é rejeitado — assume `true`.
- **Impacto:** Cosmético/baixo. É uma preferência de UI do próprio usuário autenticado; aceitar default é tolerável. Apenas inconsistente com o padrão "valida e 400" do resto da API.
- **Correção:** Opcional — validar com `z.object({ dontShowAgain: z.boolean() })` e responder 400 em corpo malformado, ou documentar explicitamente que o default é intencional. Como o efeito é inócuo, pode ser **Aceito (risco assumido)**.
- **Verificação:** N/A (decisão de padronização).

### [API-005] Envelope de erro flat (`{ error, code }`) diverge do formato sugerido pela referência (`{ error: { code, message } }`)
- **Severidade:** P3
- **Status:** Aberto
- **Local:** Convenção global — ex.: `src/app/api/loja/checkout/status/route.ts`, `src/app/api/checkout/status/route.ts`, e centenas de outros.
- **Evidência:** O projeto padroniza respostas em `{ data: ... }` para sucesso e `{ error: "mensagem", code?: "CODE" }` (flat) para erro. A referência sugere `{ error: { code, message } }` aninhado e documentação OpenAPI.
- **Impacto:** Nenhum funcional — a convenção é consistente internamente e nenhum terceiro consome essa API (é app-interno; não há consumidor externo como JR Multas/Nexa). Ausência de OpenAPI é aceitável para API privada (referência: "Ausência = P2/P3"). Fica como P3 de consistência/documentação.
- **Correção:** Decisão de produto: (a) manter a convenção flat e documentá-la num `docs/api/conventions.md`, ou (b) padronizar para o envelope aninhado se algum consumidor externo surgir. Recomendado (a).
- **Verificação:** N/A (decisão de padronização/documentação).

### [API-006] Webhook do LMS não exige X-PMB-Event-Id — entrega sem header não é idempotente (ticket/efeito duplicado em retry)
- **Severidade:** P3
- **Status:** Aberto
- **Local:** `src/app/api/webhooks/lms/route.ts:54,85-97`
- **Evidência:** A idempotência depende do header `X-PMB-Event-Id` (gravado em `webhook_logs.external_event_id`, que é `@unique`). Mas o receiver trata o header como OPCIONAL:
  ```ts
  // linha 86-97
  if (eventId) {
    const existing = await prisma.webhookLog.findUnique({ where: { externalEventId: eventId }, ... })
    if (existing?.processed) return NextResponse.json({ received: true, duplicate: true })
    logId = existing?.id ?? (await createLog(eventType, payload, request, eventId))
  } else {
    logId = await createLog(eventType, payload, request, null)   // <- sem dedupe
  }
  ```
  Quando o LMS entrega SEM o header (ou com header vazio), cada re-entrega cai no `else` e é processada de novo. Para `student.question.created` (`lib/webhooks/lms-process.ts:155-177` → `createStudentSupportTicket`), isso cria um `ContactMessage` NOVO a cada retry — ticket de suporte duplicado. Para `course.completed` a emissão de certificado tem dedup interna (seguro) e o catálogo é idempotente (overwrite), então só o suporte e o progresso sofrem efeito visível.
- **Impacto:** Baixo. Depende de o LMS deixar de mandar o `X-PMB-Event-Id` numa re-entrega — comportamento que o contrato proíbe, mas que o receiver não força. Resultado: tickets de suporte duplicados na caixa de atendimento da revenda/PMB se o LMS retransmitir um `student.question.created` sem id estável.
- **Correção:** Em `src/app/api/webhooks/lms/route.ts`, após validar a assinatura e o tipo (linha ~73), exigir o header: se `!eventId`, retornar `NextResponse.json({ error: "X-PMB-Event-Id obrigatório" }, { status: 400 })` ANTES de criar o log/processar. Atualizar o doc da aba API (`/admin/configuracoes`) e o MD copiável para deixar o header como obrigatório no contrato. Alternativa mais robusta: derivar um event-id determinístico de `hash(eventType + rawBody)` quando o header faltar, e usá-lo como `externalEventId` para manter o dedupe.
- **Verificação:** Enviar duas entregas idênticas SEM `X-PMB-Event-Id` (HMAC válido) para `/api/webhooks/lms` com `event-type: student.question.created` — após o fix, a 2ª deve retornar 400 (ou ser deduplicada) e `ContactMessage` deve existir só 1x. Teste unitário no estilo de `src/lib/webhooks/lms-webhook.test.ts`.

### [API-007] course.published/unpublished do webhook LMS dispara re-sync COMPLETO do catálogo inline por evento (amplificação)
- **Severidade:** P3
- **Status:** Aberto
- **Local:** `src/lib/webhooks/lms-process.ts:148-153` · `src/lib/catalog/sync-lms.ts:21+`
- **Evidência:**
  ```ts
  // lms-process.ts:148-153
  case "course.published":
  case "course.unpublished": {
    catalogSchema.parse(payload)
    await syncCatalogFromLMS("cron")   // <- sync de TODO o catálogo, não só do curso do evento
    return { ok: true, message: `catálogo sincronizado (${eventType})` }
  }
  ```
  `syncCatalogFromLMS` faz `listLmsCourses()` + 1 chamada de detalhe (`getLmsCourse`) por curso (`sync-lms.ts` comentário "1 call extra por curso"). O receiver processa síncrono com `maxDuration=300` (`route.ts:13`). Cada evento de (des)publicação re-sincroniza o catálogo inteiro, não apenas o curso publicado.
- **Impacto:** Ineficiência/amplificação. Um lote de publicações no LMS (ex.: importação em massa) gera N webhooks, cada um varrendo todo o catálogo (N×M chamadas externas). Não é vetor de DoS externo porque exige HMAC válido (só o LMS legítimo dispara), mas pode estourar tempo/limites em picos e atrasar o ack ao LMS. O comentário em `day-update.ts:23` ainda diz "o webhook LMS->PMB está desligado", inconsistente com o receiver agora ativo — não é bug, mas indica que o caminho não foi reavaliado para custo.
- **Correção:** Em `processLmsWebhookEvent` (case published/unpublished), em vez de `syncCatalogFromLMS` completo, atualizar só o curso do evento por `lmsCourseId`/`lmsSlug` (espelhar o `updateMany` por `lmsCourseId` que o `day-update.ts:52-56` já faz para (des)publicação) ou debouncing (agendar um sync via flag e deixar o cron `sync-cursos-lms` consolidar). Atualizar o comentário de `day-update.ts:23` para refletir que o webhook está ativo.
- **Verificação:** `grep` confirma que o case published/unpublished não chama mais `syncCatalogFromLMS` por evento; teste: simular 5 webhooks `course.published` e medir que o nº de chamadas a `listLmsCourses` não escala linearmente.

### [API-008] wa-client (engine WhatsApp/WAHA) lê process.env direto e não tem retry/backoff no envio
- **Severidade:** P3
- **Status:** Aberto
- **Local:** `src/lib/automation/wa-client.ts:22-27,29-56,378-417`
- **Evidência:** (1) Config lida via `process.env.WA_GATEWAY_URL`/`WA_GATEWAY_API_KEY` direto (linhas 23-24), contrariando a regra do projeto em `src/lib/env.ts` ("NÃO leia process.env.X diretamente em código novo — sempre via env.ts"); `WA_GATEWAY_*` nem está no schema de `env.ts` (não há fail-fast/validação no boot). (2) `gatewayFetch` tem timeout (15s, AbortController) e degradação graciosa (stop/logout/delete toleram falha), mas `sendTextMessage` (linha 395-407) e `startSession` NÃO têm retry/backoff: um 5xx transitório do engine na hora do envio falha a mensagem em definitivo (o caller marca como falha de envio; sem reentrega).
- **Impacto:** Baixo. A integração é só de SAÍDA (não há webhook de entrada do WAHA — confirmado por grep: nenhum handler inbound). O QR/connect é interativo (usuário re-tenta na tela). O dispatch de automação é fire-and-forget; um blip transitório do engine perde aquele disparo de WhatsApp (lead não recebe a mensagem automática). A referência pede "Retry com backoff exponencial em falha transitória" e "Validação de config no boot das integrações" — ambos parcialmente não atendidos para o WAHA. ⚠️MIGRAÇÃO: o engine WAHA roda fora da Vercel; na VPS Swarm, `WA_GATEWAY_URL` apontará para o serviço interno — adicionar ao schema de env.ts ajuda a pegar config divergente cedo (lição do 401 por chave divergente citada na referência).
- **Correção:** (1) Adicionar `WA_GATEWAY_URL`/`WA_GATEWAY_API_KEY` ao schema de `src/lib/env.ts` (opcionais; warning em prod via `assertEnv` se a automação estiver ligada e faltar) e ler via `env`. (2) Envolver `sendTextMessage` (e opcionalmente `startSession`) num retry com backoff exponencial (2-3 tentativas, só em 5xx/rede/timeout — não em 4xx nem em `WhatsAppNumberNotFoundError`), espelhando o padrão de `lib/lms/client.ts` e `lib/asaas/client.ts`.
- **Verificação:** `grep "process.env.WA_GATEWAY" src` retorna zero (passou a usar env.ts); teste unitário de `sendTextMessage` com mock de engine devolvendo 503 na 1ª e 200 na 2ª, esperando 1 mensagem entregue.

## Cobertura

Áreas de route handlers e integrações revisadas (294/294 handlers + clients + crons + webhooks):

### Webhooks (3/3) — OK (1 P3 no LMS)
- `api/webhooks/asaas/route.ts` — **OK**. Token timing-safe (`tokensMatch`/`timingSafeEqual`), branch PMB (env `ASAAS_WEBHOOK_TOKEN` via `validateAsaasWebhook`) vs revenda (`asaasWebhookToken` por-tenant, descriptografado), Zod via `parseAsaasWebhookPayload`, slug sanitizado `[a-z0-9_-]{1,64}`, WebhookLog com token redatado (4+4 chars), 200 rápido / 500 para retry, processador idempotente por `asaasPaymentId`. `runtime=nodejs`, `maxDuration=60`.
- `api/webhooks/mercadopago/route.ts` + `lib/mercadopago/process.ts` + `lib/mercadopago/webhook.ts` — **OK**. HMAC SHA256 (manifest `id;request-id;ts`) + anti-replay, early-reject sem x-signature/x-request-id em prod, idempotência em 3 camadas (dedupe `mpPaymentId` → resolve tenant → HMAC por-conta → `getPayment` com token do tenant 404 cross-tenant → advisory lock no fulfill), IPN legado deduplicado, secret PMB plain vs revenda criptografada, dev-bypass DUPLO-gated (`MP_WEBHOOK_DEV_BYPASS===1` **e** `NODE_ENV!==production`), x-signature redatado no log.
- `api/webhooks/lms/route.ts` + `lib/webhooks/lms-webhook.ts` + `lib/webhooks/lms-process.ts` — **OK / Achado API-006, API-007**. HMAC SHA256 sobre `"<ts>.<rawBody>"` com `PMB_WEBHOOK_SECRET`, anti-replay 10min, assinatura validada ANTES de qualquer efeito/log, idempotência por `externalEventId` (@unique) com tratamento de corrida P2002, 503 quando secret ausente, 200/500/400 corretos. **API-006**: idempotência não é forçada quando o header `X-PMB-Event-Id` falta. **API-007**: published/unpublished re-sincroniza o catálogo inteiro inline.

### Crons (16/16) — OK
Todos com `isCronAuthorized` (CRON_SECRET timing-safe via `lib/auth/bearer`, rejeita se env ausente) + `maxDuration` + idempotência documentada. GET delega a POST (auth preservada): cleanup-webhook-logs, reactivate-paid, reconcile-tenant-payments, referral-monthly-payout (catch-up, idempotente), **resync-lms-credentials** (NOVO — relê GET /students/:id, regrava lmsLogin/Senha cifrada/PortalUrl, dry-run por padrão, nunca expõe senha plana), **resync-platform-passwords** (relê EA, regrava ea_aluno_senha cifrada, dry-run, nunca expõe senha), **sync-lms-branding** (NOVO — backfill PUT /tenants/:id, dry-run, best-effort), sweep-abandoned-leads, sweep-students-expired, sweep-students-overdue, sweep-tenants-overdue, sweep-visitor-events, sync-cursos (EA), sync-cursos-lms (match por `lmsCourseId`), sync-day-update-lms (delta + cursor), sync-progresso. **OK**. (Obs P3 menor: sync-cursos-lms e sync-day-update-lms vazam `err.message` no corpo do 502, mas são CRON_SECRET-protegidos — não público.)

### Clients de integração (5/5 + transient) — OK
- `lib/asaas/client.ts` — timeout 20s/tentativa (`AbortSignal.timeout`), retry 3 + backoff exp, não-retry 4xx, normaliza `/v3`, log de erro sem token. **OK**.
- `lib/mercadopago/client.ts` — timeout 20s, retry 3 + backoff, `X-Idempotency-Key` em `createPayment`, token por-tenant descriptografado. **OK**.
- `lib/lms/client.ts` — timeout 25s, retry 3 + backoff, `Idempotency-Key` em enrollment, Bearer `LMS_API_KEY`, 4xx não-retry, novo `putLmsTenantBranding` (PUT /tenants/:id). **OK**.
- `lib/plataforma-cursos/client.ts` (EA, form-data!) — timeout 25s, retry 3 + backoff, DELETE via headers, erro de API (`data.erro`) não-retry. **OK**.
- `lib/automation/wa-client.ts` (engine WhatsApp/WAHA, SAÍDA) — timeout 15s (AbortController), degradação graciosa, start idempotente. **Achado API-008** (process.env direto + sem retry no envio). Nenhum webhook de ENTRADA do WAHA (grep zero) — N/A para verificação de assinatura inbound.
- `lib/webhooks/transient.ts` — classificação transitório vs terminal por tipo de erro (MP/Asaas 5xx|0, EA 5xx|sem-status, Prisma P2034/P1001/P1002/P1008/P1017). **OK**.

### Provisionamento de matrícula (fulfill.ts) — OK
`lib/enrollment/fulfill.ts` — advisory lock por `(gateway, externalPaymentId)`, dedupe `mp/asaasPaymentId`, guard `Payment.tenantId === Enrollment.tenantId` (anti-receita-cruzada), branch EA (`ensureStudentOnPlatform`+`linkCourseToStudent`) vs LMS (`createLmsEnrollment` com Idempotency-Key=payment id), **credenciais de plataforma por matrícula** (`res.partnerAccess` → `lmsLogin`/`lmsSenha=encrypt(...)` cifrada/`lmsPortalUrl`, senha NUNCA logada — linhas 757-764, 882-884), pacotes mistos via `provisionCourseForStudent`, falha parcial LMS alerta+segue. **OK**.

### Branding white-label LMS — OK
`lib/lms/branding.ts:syncTenantBrandingToLms` — best-effort, no-op se LMS não configurado ou tenant `__pmb__`, NUNCA lança (não derruba criar/editar revenda). Disparado de `lib/resellers/create.ts:296`, `painel/vitrine/route.ts:127`, `painel/vitrine/upload/route.ts:145,218` + backfill via cron. **OK**.

### SSO LMS / acesso ao curso — OK
`aluno/curso/[enrollmentId]/acessar/route.ts` — `requireStudentSession`, escopo por `studentId` + status ACTIVE/COMPLETED + `provider===LMS`, ramifica `lmsPlayback` redirect (portalUrl do banco, server-controlled) vs SSO (`createLmsSsoToken` uso-único TTL ~5min sob demanda no clique). **OK**.

### Suporte roteado por tenant (LMS) — OK (cruza API-006)
`lib/support/student-support.ts:createStudentSupportTicket` — `ContactMessage` kind STUDENT_SUPPORT roteado por tenant (PMB→SUPER_ADMIN/email PMB; revenda→TENANT/email do dono), best-effort (persist/notif/email não lançam), sem PII em log. Único ponto não-idempotente é a falta de enforcement do event-id no receiver (**API-006**).

### Endpoints de teste de integração (config) — OK
`admin/config/test-mp` (conta tenants com token, não chama MP), `test-asaas`, `test-plataforma` — `requireAdminSession`, sem SSRF (não recebem URL do client), sem vazamento de segredo. **OK**.

### Checkout / pagamentos (Zod + rate-limit) — OK
`loja/checkout` (+process/package/status/checkout-inquiry), `checkout` (+mp/process/package/status/confirmacao/[id]/status), `aluno/comprar`, `aluno/pagamentos/verificar`, `cobranca/[paymentId]` (+billing-info/pay-card), `loja/cupom/validar`. Status endpoints escopam por `tenantId` (anti-IDOR), `notification_url`/`notificationUrl` via `mpWebhookUrl()`/`asaasWebhookUrl()` em TODOS os call-sites (grep de concat manual = zero — API-001 fechado). **OK**.

### admin/vendas (ex-API-001) — OK (CORRIGIDO)
`src/app/api/admin/vendas/route.ts` — ambos os branches MP (preapproval linha 388 + preference linha 450) usam `mpWebhookUrl()`; Asaas usa `asaasWebhookUrl()` (514, 567). `back_urls`/`back_url` ainda usam `appUrl` concat (linhas 384, 438) — aceitável (browser segue 307→www; não é entrega POST). Bolsa de estudo (fulfill síncrono sem gateway) com rollback de enrollment em falha. Cap de cupom corrigido (efetivo, cobre FIXED). **OK**.

### Endpoints públicos (Zod + rate-limit) — OK
`contato`, `leads`, `pmb/leads`, `loja/leads`, `loja/track`, `public/capture-ref`, `public/validate-ref`, `revendedores/cadastro`, `catalogo/sugestoes`, `placar/stream` (SSE, agregação server-side), `metrics/public`, `metrics` (`home/showcase`), `observability/client-log` (rate-limit failOpen + Zod + max 500/200 chars + redação PII no logger), `push/public-key`. **OK**.

### Auth / internal (Zod/token) — OK
`auth/[...nextauth]`, `auth/forgot-password`, `auth/reset-password`, `auth/alterar-senha-inicial`, `auth/handoff` + `handoff/start` (token uso-único, anti-open-redirect), `internal/resolve-tenant` (`isInternalAuthorized` + rate-limit). **OK**.

### Uploads (MIME+magic+tamanho+dim) — OK
`admin|painel/banner/upload`, `admin|painel/certificate-template/upload`, `admin|painel/pacotes/capa`, `painel/cursos/[id]/capa`, `painel/vitrine/upload`, `admin/system-settings/{eja,tecnica,group-logo}/upload`, `admin/financeiro/referral-payouts/[id]/proof`. Validam tipo + `isValidImageMagic` + bytes + dimensões + rate-limit. **OK**. ⚠️MIGRAÇÃO: Supabase Storage → MinIO.

### Automação WhatsApp (admin + painel) — OK (1 P3)
`admin|painel/automacao/whatsapp/{connect,disconnect,pair,status}`, `.../config`, `.../templates`, `lib/automation/{dispatch,leads,wa-client}`. Guard de sessão+role/tenant, gate `pmbAutomationEnabled`/automação por tenant, sessionName randomizado, recuperação de estado FAILED. **Achado API-008** (config + retry no client). **OK** quanto a authZ.

### Push (Web Push / VAPID) — OK
`push/devices` (GET), `push/devices/[id]` (DELETE), `push/public-key` (GET, expõe só VAPID_PUBLIC_KEY — público por design), `push/subscribe` (POST/DELETE — `auth()` + Zod `subscribeSchema`/`deleteSchema`). **OK**.

### Sub-revendas (commits recentes) — OK
`admin/tenants/[id]/can-sell-resellers` (PUT, `requireAdminSession` SUPER_ADMIN + Zod boolean), `painel/revendas` (POST, `requireResellerSeller` + Zod + escopo `sellerTenantId`), `painel/revendas/leads/[id]` (PATCH, guard + Zod). Gate de plano (209/239) server-side. **OK**.

### Admin (130) e Painel (86) handlers — OK
Varredura exaustiva por categoria de mutação (alunos, atendimento, automação, banner, catálogo, certificados, comissões/indicações, config, cupons, equipe, financeiro, home-sections, leads, notificações, pacotes, referrals, relatórios, revendedores, sub-revendas, system-settings, tenants, treinamentos, vendas, vitrine): todos os POST/PUT/PATCH/DELETE que leem body usam `safeParse`/`.parse` Zod (inline ou via lib helper, incl. home-sections agora com schema Zod) + guard de sessão+role/tenant. **OK**.

### Handlers GET com prisma write — OK (verificado)
Escritas dentro de GET são apenas `upsert`/`create` idempotentes de provisionamento de linha-default (`systemSettings` id="default" lazy-init em automacao/config, day-update, certificate auto-issue flag). **Nenhuma mutação de estado de negócio via GET.** **OK**.

### ⚠️MIGRAÇÃO (Vercel→VPS/Swarm)
- **apex vs www / 307:** RESOLVIDO em todos os call-sites de webhook por `lib/tenant/urls.ts:webhookBaseUrl()` (força `www.` quando host == apex) — grep de concat manual = zero (API-001 fechado). Na VPS+Traefik, garantir regra de redirect apex→www OU `NEXT_PUBLIC_APP_URL` no host canônico que recebe POST sem redirect.
- **Edge runtime:** Nenhum route handler em `src/app/api/**` usa `runtime="edge"` (todos `nodejs`). Bom para o Swarm. `src/proxy.ts` (middleware, Edge) é fora do escopo deste domínio.
- **@upstash/redis (REST não fala TCP):** `lib/redis` é usado por rate-limit e cache de tenant; no Swarm trocar por `ioredis`/`redis` TCP ou SRH. `/api/health` faz `redis.ping()` informativo (não derruba). Webhooks/crons não dependem de Redis para correção.
- **WAHA gateway (API-008):** engine roda fora da Vercel; `WA_GATEWAY_URL` apontará para serviço interno no Swarm. Adicionar ao schema de env.ts (hoje `process.env` direto) reduz risco de config divergente (lição WAHA da referência).
- **Segredos por env:** `MP_WEBHOOK_SECRET`, `ASAAS_WEBHOOK_TOKEN`, `PMB_WEBHOOK_SECRET`, `CRON_SECRET`, `INTERNAL_SECRET`, `EA_API_*`, `LMS_API_*`, `WA_GATEWAY_*` em `.env.example`. Helpers (`isCronAuthorized`, `validateAsaasWebhook`, `validateLmsWebhookSignature`) fail-closed quando env ausente — provisionar TODOS via Docker Swarm secrets antes do cutover, senão webhooks/crons retornam 401/503/500. `MP_WEBHOOK_DEV_BYPASS` NUNCA deve ser setado em prod (gate duplo já protege, mas não incluir nos secrets de prod).
- **Crons:** hoje agendados via Supabase pg_cron (`app_internal.run_cron`). Na VPS, reagendar os 16 jobs (cron do SO / scheduler do Swarm) batendo nas rotas com `Authorization: Bearer $CRON_SECRET`. Os crons "write=1" (resync-lms-credentials, resync-platform-passwords, sync-lms-branding) são dry-run por padrão — agendar com `?write=1` quando reativar.
- **Webhook do LMS (PMB_WEBHOOK_URL):** o LMS precisa apontar `PMB_WEBHOOK_URL` para o host canônico (www) e compartilhar `PMB_WEBHOOK_SECRET`; na VPS, garantir TLS + host correto (assinatura é sobre rawBody, não sobre URL — só o roteamento muda).
