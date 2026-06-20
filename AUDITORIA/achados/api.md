# Auditoria — API e Integrações
_Data: 2026-06-20 · Referência: .claude/skills/auditoria-saas/references/07-api-integracoes.md · Itens do inventário cobertos: 281/281 route handlers + 5 clients de integração (Asaas, MP, LMS, EA/plataforma-cursos, transient) + 13 crons + 2 webhooks_

## Resumo
- Itens verificados: 281 route handlers, 5 integration clients, 13 crons, 2 webhooks, helpers de URL/auth.
- Achados: P0=0 · P1=1 · P2=2 · P3=3 · Nota do domínio: 8.5/10
- **Handlers que leem body sem validação Zod: 0 com ausência real de validação.** 7 leem JSON sem `zod` inline, mas TODOS validam server-side: 6 de home-sections delegam a `lib/home/api.ts` (typeof + `validateSectionPayload`); 1 (`onboarding-tour`) faz `typeof === "boolean"`. Demais 11 "sem zod" do scan inicial são uploads `formData` (validam MIME+magic-bytes+tamanho+dimensões) ou usam helpers Zod via lib (`parseTrackingPixelsInput`, `parseAsaasWebhookPayload`). Ver `## Cobertura`.

Lista P0/P1:
- **[API-001] (P1)** `notification_url` do MP no checkout avulso admin construída sem o helper canônico → webhook perdido (apex 307→www ou env vazia).

O domínio está, no geral, maduro: webhooks com verificação de assinatura (Asaas token timing-safe; MP HMAC SHA256 + anti-replay), idempotência forte (advisory lock + dedupe por payment id), todos os 4 clients externos com timeout(20-25s)+retry(3)+backoff exponencial, todos os 13 crons protegidos por `CRON_SECRET` timing-safe e idempotentes, uploads com validação profunda, e o problema histórico do apex-307 já resolvido por `webhookBaseUrl()` em quase todos os call-sites.

## Achados

### [API-001] notification_url do MP no checkout avulso (admin) ignora o helper canônico — webhook pode se perder
- **Severidade:** P1
- **Status:** Aberto
- **Local:** `src/app/api/admin/vendas/route.ts:447`
- **Evidência:** No mesmo arquivo há DOIS branches de criação de cobrança MP. O branch de assinatura/preapproval (linha 388) foi corrigido e usa o helper, com comentário explícito do porquê:
  ```ts
  // linha 385-388
  // mpWebhookUrl() (sem ?tenant = PMB) NUNCA é undefined e usa o host
  // canônico www — evita o webhook perdido por env vazia OU pelo apex que
  // responde 307→www (que o MP não segue). Substitui a construção manual.
  notification_url: mpWebhookUrl(),
  ```
  Mas o branch de compra avulsa (preference) NÃO foi corrigido e mantém exatamente o anti-pattern que o comentário acima descreve:
  ```ts
  // linha 354
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""
  // linha 447
  notification_url: appUrl ? `${appUrl}/api/webhooks/mercadopago` : undefined,
  ```
  `grep` confirma que este é o ÚNICO call-site no projeto que monta a URL de webhook por concatenação manual em vez de `mpWebhookUrl()`/`asaasWebhookUrl()` (todos os demais — `aluno/comprar`, `checkout/mp/process`, `loja/checkout/process`, `painel/vendas`, transparent-process — usam os helpers).
- **Impacto:** Venda avulsa criada via `/admin/vendas` (SUPER_ADMIN/PMB_SALES) cujo pagamento é PIX/boleto/cartão one-time. Dois modos de falha: (1) se `NEXT_PUBLIC_APP_URL` apontar para o apex `https://profissionalizamaisbrasil.com.br`, o MP entrega o webhook no apex, recebe 307→www e NÃO segue o redirect → a notificação some, o pagamento aprovado nunca vira matrícula automática; (2) se `NEXT_PUBLIC_APP_URL` estiver vazia, `notification_url` vira `undefined` → o MP não tem para onde notificar. Em ambos o aluno paga e fica PENDING até reconciliação manual (sync-payment) — degradação silenciosa de fulfillment numa venda assistida pela própria equipe.
- **Correção:** Em `src/app/api/admin/vendas/route.ts`, na chamada `createPreference(...)` (linha ~447), trocar `notification_url: appUrl ? \`${appUrl}/api/webhooks/mercadopago\` : undefined` por `notification_url: mpWebhookUrl()` (o helper já está importado na linha 24). Opcionalmente, alinhar também `back_urls` (linhas 438-444) ao mesmo `webhookBaseUrl()`/host canônico usado na linha 384, embora back_urls seja menos crítico (browser segue redirect).
- **Verificação:** `grep -rn "api/webhooks" src/app/api --include=route.ts | grep -v "mpWebhookUrl\|asaasWebhookUrl"` deve retornar zero linhas de construção manual. Teste manual: criar venda avulsa one-time no MP sandbox e confirmar que `notification_url` da preference aponta para `www.` (não apex) e nunca undefined.

### [API-002] /api/health vaza mensagem de erro do banco em endpoint sem autenticação
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `src/app/api/health/route.ts:40-49`
- **Evidência:**
  ```ts
  return NextResponse.json(
    { status: "unhealthy", checks,
      error: err instanceof Error ? err.message : "db error",
      latencyMs: Date.now() - start },
    { status: 503 },
  )
  ```
  O endpoint é explicitamente público ("Não exige auth. Por design: monitoring chama sem token").
- **Impacto:** Em falha do Postgres, a mensagem crua do Prisma (que pode conter host/porta do pooler Supabase, nome de schema, ou detalhe de driver) é devolvida a qualquer chamador anônimo. Vazamento de detalhe de infraestrutura para reconhecimento de atacante. ⚠️MIGRAÇÃO: no Swarm/Traefik, esse erro pode revelar o nome do serviço/host interno do Postgres self-hosted.
- **Correção:** Não retornar `err.message` no corpo público. Logar o detalhe via `contextLogger().error({err}, "health db check failed")` e responder apenas `{ status: "unhealthy", checks, latencyMs }` com 503. O monitoring só precisa do status code/flag, não da mensagem.
- **Verificação:** `curl` ao endpoint com DB derrubado deve retornar 503 sem campo `error` contendo string do driver. Teste: forçar falha e inspecionar corpo.

### [API-003] Validação de body em home-sections é manual (typeof), não Zod — inconsistente com o resto da API
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `src/lib/home/api.ts:55-322` (consumido por `src/app/api/admin/home-sections/route.ts`, `.../[id]/route.ts`, `.../reorder/route.ts` e os 3 equivalentes em `painel/home-sections/*`)
- **Evidência:** Os 6 route handlers de home-sections fazem `await request.json().catch(() => null)` e delegam a `createSection/updateSection/deleteSection/reorderSections`, que validam com `typeof`/`Array.isArray`/`validateSectionPayload` em vez de um schema Zod (ex.: `lib/home/api.ts:215-217`, `:246-250`, `:305`). Há validação server-side real (não é ausência), mas foge do padrão Zod adotado em ~98% dos handlers do projeto.
- **Impacto:** Risco baixo hoje (a validação manual cobre os campos usados). O risco é de manutenção: validação ad-hoc é mais fácil de regredir do que um schema declarativo, e a referência exige "validação de request com Zod". `config` é gravado como `Prisma.InputJsonValue` após `validateSectionPayload` — confiar que esse validador é exaustivo é mais frágil que um schema central.
- **Correção:** Modelar os payloads de section (create/update/reorder) com Zod em `lib/home/sections.ts` (discriminated union por `kind`) e usar `safeParse` em `lib/home/api.ts`, substituindo os `typeof`/`Array.isArray` manuais. Mantém o mesmo comportamento (400 em payload inválido) com contrato declarativo.
- **Verificação:** `npx tsc --noEmit` verde + testes de payload inválido (kind desconhecido, config malformada, order não-array) retornando 400.

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
- **Local:** Convenção global — ex.: `src/app/api/loja/checkout/status/route.ts:20-23`, `src/app/api/checkout/status/route.ts:11-15`, e centenas de outros.
- **Evidência:** O projeto padroniza respostas em `{ data: ... }` para sucesso e `{ error: "mensagem", code?: "CODE" }` (flat) para erro. A referência sugere `{ error: { code, message } }` aninhado e documentação OpenAPI.
- **Impacto:** Nenhum funcional — a convenção é consistente internamente e nenhum terceiro consome essa API (é app-interno; não há `JR Multas`/`Nexa` aqui). Ausência de OpenAPI é aceitável para API privada (referência: "Ausência = P2/P3"). Fica como P3 de consistência/documentação.
- **Correção:** Decisão de produto: (a) manter a convenção flat e documentá-la num `docs/api/conventions.md`, ou (b) padronizar para o envelope aninhado se algum consumidor externo surgir. Recomendado (a) — não vale a refatoração em massa de centenas de handlers sem consumidor externo.
- **Verificação:** N/A (decisão de padronização/documentação).

## Cobertura

Áreas de route handlers e integrações revisadas (281/281 handlers + clients + crons + webhooks):

### Webhooks (2/2) — OK
- `api/webhooks/asaas/route.ts` — **OK**. Token timing-safe (`tokensMatch`/`timingSafeEqual`), branch PMB (env `ASAAS_WEBHOOK_TOKEN`) vs revenda (`asaasWebhookToken` por-tenant, descriptografado), Zod via `parseAsaasWebhookPayload`, WebhookLog com token redatado, 200 rápido / 500 para retry, processador idempotente por `asaasPaymentId`. `runtime=nodejs`, `maxDuration=60`.
- `api/webhooks/mercadopago/route.ts` + `lib/mercadopago/process.ts` + `lib/mercadopago/webhook.ts` — **OK**. HMAC SHA256 (manifest `id;request-id;ts`) + anti-replay (janela 10min, `tsToMillis` s/ms), early-reject sem x-signature/x-request-id em prod, idempotência em 3 camadas (dedupe `mpPaymentId` → resolve tenant → HMAC por-conta → `getPayment` com token do tenant 404 cross-tenant → advisory lock no fulfill), IPN legado deduplicado, secret PMB plain vs revenda criptografada, `isTransientWebhookError` decide rethrow(500/retry) vs swallow(markLog).

### Crons (13/13) — OK
Todos com `isCronAuthorized` (CRON_SECRET timing-safe, rejeita se env ausente) + `maxDuration` + idempotência documentada. GET delega a POST (auth preservada): cleanup-webhook-logs, reactivate-paid, reconcile-tenant-payments (idempotente, sequencial p/ rate limit), referral-monthly-payout (catch-up 3 meses, idempotente), sweep-abandoned-leads, sweep-students-expired, sweep-students-overdue, sweep-tenants-overdue, sweep-visitor-events, sync-cursos (EA), sync-cursos-lms (match por `lmsCourseId`), sync-day-update-lms (delta), sync-progresso. **OK**.

### Clients de integração (5/5) — OK
- `lib/asaas/client.ts` — timeout 20s/tentativa (`AbortSignal.timeout`), retry 3 + backoff exp, não-retry 4xx, normaliza `/v3`, log de erro sem token. **OK**.
- `lib/mercadopago/client.ts` — timeout 20s, retry 3 + backoff, `X-Idempotency-Key` em `createPayment`, token por-tenant descriptografado. **OK**.
- `lib/lms/client.ts` — timeout 25s, retry 3 + backoff, `Idempotency-Key` em enrollment, Bearer `LMS_API_KEY`, 4xx não-retry. **OK**.
- `lib/plataforma-cursos/client.ts` (EA, form-data!) — timeout 25s, retry 3 + backoff, DELETE via headers, erro de API (`data.erro`) não-retry. **OK**.
- `lib/webhooks/transient.ts` — classificação transitório vs terminal por tipo de erro (MP/Asaas 5xx|0, EA 5xx|sem-status, Prisma P2034/P1001/P1002/P1008/P1017). **OK**.

### Provisionamento de matrícula (fulfill.ts) — OK
`lib/enrollment/fulfill.ts` — advisory lock por `(gateway, externalPaymentId)`, dedupe `mp/asaasPaymentId`, guard `Payment.tenantId === Enrollment.tenantId` (anti-receita-cruzada), branch EA (`ensureStudentOnPlatform`+`linkCourseToStudent`) vs LMS (`createLmsEnrollment` com Idempotency-Key=payment id), pacotes mistos via `provisionCourseForStudent` por item, falha parcial LMS (`provisioning.ok=false`) alerta+segue. **OK**.

### Checkout / pagamentos (todos com Zod + rate-limit) — OK
`loja/checkout` (+process/package/status/checkout-inquiry), `checkout` (+mp/process/package/status/confirmacao/[id]/status), `aluno/comprar`, `aluno/pagamentos/verificar` (session+rate-limit+reconcile idempotente), `cobranca/[paymentId]` (+billing-info/pay-card, rate-limit), `loja/cupom/validar`. Status endpoints escopam por `tenantId` (anti-IDOR), sem PII no corpo. **OK**.

### Endpoints públicos (Zod + rate-limit) — OK
`contato`, `leads`, `pmb/leads`, `loja/leads`, `loja/track`, `public/capture-ref`, `public/validate-ref`, `revendedores/cadastro`, `catalogo/sugestoes`. `placar/stream` (SSE) — agregação server-side, sem PII, sem anon-key exposta. `metrics/public`, `home/showcase`. **OK**.

### Auth / internal (Zod/token) — OK
`auth/[...nextauth]`, `auth/forgot-password`, `auth/reset-password`, `auth/alterar-senha-inicial` (Zod+rate-limit), `auth/handoff` + `handoff/start` (token uso-único `consumeHandoffToken`, `isSafeInternalPath` anti-open-redirect, fallback gracioso), `internal/resolve-tenant` (`isInternalAuthorized` + rate-limit). `aluno/curso/[enrollmentId]/acessar` (SSO LMS, escopo por studentId, single-use token). **OK**.

### Uploads (MIME+magic+tamanho+dim) — OK
`admin/banner/upload`, `painel/banner/upload`, `admin/certificate-template/upload`, `painel/certificate-template/upload`, `admin/pacotes/capa`, `painel/pacotes/capa`, `painel/cursos/[id]/capa`, `painel/vitrine/upload`, `admin/system-settings/{eja,tecnica,group-logo}/upload`, `admin/financeiro/referral-payouts/[id]/proof`. Validam tipo permitido + `isValidImageMagic` + limite de bytes + dimensões + rate-limit `upload`. **OK**.

### Admin (126) e Painel (82) handlers — OK (com 2 ressalvas)
Amostragem exaustiva por categoria de mutação (alunos, catálogo, certificados, comissões/indicações, config, cupons, equipe, financeiro, leads, notificações, pacotes, treinamentos, vendas, vitrine): todos os POST/PUT/PATCH/DELETE que leem body usam `safeParse`/`.parse` Zod (inline ou via lib helper) + guard de sessão+role. Ressalvas: **API-001** (admin/vendas notification_url) e **API-003** (home-sections validação manual, 6 handlers).

### Handlers GET com prisma write — OK (verificado)
Scan inicial sinalizou ~56 arquivos GET+write; inspeção confirmou que as mutações estão nos verbos PUT/PATCH/POST do MESMO arquivo (não no GET). Únicas escritas dentro de GET são `upsert`/`create` idempotentes de provisionamento de linha-default (ex.: `admin/automacao/config/route.ts:18` upsert `systemSettings` default) — padrão aceitável de lazy-init. **Nenhuma mutação de estado de negócio via GET.** **OK**.

### ⚠️MIGRAÇÃO (Vercel→VPS/Swarm)
- **apex vs www / 307:** RESOLVIDO em quase todo lugar por `lib/tenant/urls.ts:webhookBaseUrl()` (força `www.` quando host == apex). EXCEÇÃO = **API-001** (admin/vendas:447). Na VPS+Traefik, garantir que a regra de redirect apex→www continue existindo OU que `NEXT_PUBLIC_APP_URL` já aponte para o host canônico que recebe POST sem redirect.
- **Edge runtime:** Nenhum route handler em `src/app/api/**` usa `runtime="edge"` (grep zero) — todos `nodejs`. Bom para o Swarm. Atenção apenas ao `src/proxy.ts` (middleware, Edge) que é fora do escopo deste domínio mas roda no Edge.
- **Segredos por env:** `MP_WEBHOOK_SECRET`, `ASAAS_WEBHOOK_TOKEN`, `CRON_SECRET`, `INTERNAL_SECRET`, `EA_API_*`, `LMS_API_*` todos presentes em `.env.example`. Helpers (`isCronAuthorized`, `validateAsaasWebhook`) rejeitam quando a env está ausente (fail-closed) — na migração, provisionar TODAS via Docker Swarm secrets antes do cutover, senão webhooks/crons retornam 401/500.
- **Crons:** hoje agendados via Supabase pg_cron (`vercel.json` crons=`[]`). Na VPS, reagendar os 13 jobs (cron do SO / scheduler do Swarm) batendo nas rotas com header `Authorization: Bearer $CRON_SECRET`.
