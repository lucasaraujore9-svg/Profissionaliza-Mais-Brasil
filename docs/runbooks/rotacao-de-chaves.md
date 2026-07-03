# Runbook — Rotação de chaves e segredos (SEG-006)

> Objetivo: rotacionar qualquer segredo de produção com segurança, sabendo o
> **raio de impacto** de cada um e qual exige **migração de re-cifragem**.
> Nada aqui deve ser executado por um agente automatizado — são passos de
> operador humano com acesso ao Vercel e ao banco de produção.

Fonte da verdade dos envs: `src/lib/env.ts` (schema Zod). Nunca commitar valor
real; `.env.example` só documenta os nomes.

---

## 1. Inventário de segredos e raio de impacto

### 1.1. Rotação SIMPLES (trocar o valor no Vercel + redeploy — sem migração)

Estes não cifram dados no banco; rotacionar só invalida o valor antigo.

| Segredo | O que quebra ao rotacionar | Cuidado |
|---|---|---|
| `AUTH_SECRET` / `NEXTAUTH_SECRET` | **Todas as sessões** são invalidadas (JWT re-assinado) — todo mundo é deslogado | Rotacionar fora do horário de pico; comunicar |
| `CRON_SECRET` | Crons rejeitam até o novo valor propagar ao pg_cron | Atualizar TAMBÉM `prisma/sql/pg_cron_jobs.sql` / os jobs no Supabase |
| `INTERNAL_SECRET` | Chamadas internas server→server falham até propagar | Rotacionar app + caller juntos |
| `ASAAS_WEBHOOK_TOKEN` | Webhooks Asaas passam a ser rejeitados até atualizar no painel Asaas | Trocar no painel Asaas **e** no Vercel |
| `MP_WEBHOOK_SECRET` (conta PMB) | Webhooks MP da vitrine PMB rejeitados até atualizar no painel MP | Trocar no painel MP **e** no Vercel |
| `PMB_WEBHOOK_SECRET` | Webhooks de ENTRADA do LMS (`POST /api/webhooks/lms`) rejeitados | Coordenar com o time do LMS (secret compartilhada) |
| `LMS_API_KEY` | Provisionamento/sync/SSO de cursos LMS falham | Gerar nova chave no LMS antes de trocar |
| `EA_API_TOKEN` / `ASAAS_API_KEY` | Integrações de saída falham | Gerar no provedor, trocar, validar chamada de teste |
| `UPSTASH_REDIS_REST_TOKEN` | Rate-limit/cache degradam (fail-open em alguns buckets) | Rotacionar no Upstash |
| `VERCEL_TOKEN` | Gestão de domínios custom para de funcionar | — |
| `RESEND_API_KEY` / `SMTP_PASSWORD` | Envio de email para | Rotacionar no provedor |

Procedimento simples:
1. Gerar o novo valor (ex.: `openssl rand -hex 32` para os secrets internos).
2. `vercel env rm <NOME> production` + `vercel env add <NOME> production` (ou
   pelo dashboard). Repetir para preview/dev se aplicável.
3. Onde houver contraparte externa (painel Asaas/MP/LMS/Upstash), atualizar lá.
4. Redeploy (a Vercel injeta env no build/runtime). Validar com um evento de
   teste (webhook assinado, chamada de cron, login).

### 1.2. Rotação COM MIGRAÇÃO — `ENCRYPTION_KEY` (AES-256-GCM)

`ENCRYPTION_KEY` (64 hex = 32 bytes, validada em `src/lib/env.ts` e
`src/lib/crypto.ts`) cifra campos no banco. **Trocar a chave sem re-cifrar
torna ilegível TODO campo já cifrado** (o `decrypt()` falha na auth tag) —
quebra pagamentos, provisionamento LMS e reconciliação Asaas/MP.

Campos cifrados hoje (todos via `encrypt()` de `src/lib/crypto.ts`):

| Model.campo | Onde é cifrado | Onde é lido |
|---|---|---|
| `Tenant.mpAccessToken` | `api/painel/config/connect-mp` | `mercadopago/process.ts`, `client.ts` |
| `Tenant.mpWebhookSecret` | `api/painel/config/connect-mp` | `mercadopago/process.ts` |
| `Tenant.asaasApiKey` | `api/painel/config/connect-asaas` | `asaas/client.ts` |
| `Tenant.asaasWebhookToken` | `api/painel/config/connect-asaas` | `webhooks/asaas/route.ts` |
| `SystemSettings.pmbMpAccessTokenEnc` | `lib/system-settings.ts` | config PMB |
| `Enrollment.lmsSenha` | `enrollment/fulfill.ts`, `cron/resync-lms-credentials` | `students/lms-credentials.ts`, `load-detail.ts` |
| `Student.plataformaAlunoSenha` | `students/plataforma-actions.ts`, `cron/resync-platform-passwords` | `students/platform-credentials.ts` — **transiente**: zerado (`NULL`) após o email de credenciais (ver SECURITY.md §2.5) |

**Procedimento de rotação com 2 chaves (zero downtime):**

1. **Preparar leitura com 2 chaves.** Antes de trocar, alterar `src/lib/crypto.ts`
   para aceitar uma chave secundária de descriptografia:
   - Adicionar `ENCRYPTION_KEY_OLD` (opcional) ao schema em `src/lib/env.ts`.
   - `decrypt()` tenta a chave atual e, se a auth tag falhar, tenta a antiga.
   - `encrypt()` **sempre** usa a chave nova.
2. **Setar as duas no Vercel:** `ENCRYPTION_KEY` = nova, `ENCRYPTION_KEY_OLD` =
   atual. Deploy. Agora a app grava com a nova e ainda lê o legado.
3. **Migração de re-cifragem** (script idempotente, rodado via endpoint interno
   disparado por `app_internal.run_cron` — os segredos Sensitive não são
   puláveis via `vercel env pull`, então rode no runtime de prod, não local):
   para cada campo da tabela acima, `decrypt()` (que cai na chave certa) →
   `encrypt()` com a nova → `update`. Processar em lotes; **não** usar
   `prisma.$transaction([...])` em lote sobre o pooler (ver memória do projeto —
   usar updates sequenciais). Pular `NULL`.
4. **Verificar:** amostrar registros e confirmar que `decrypt()` funciona só com
   a chave nova (temporariamente sem a antiga em staging).
5. **Remover a chave antiga:** apagar `ENCRYPTION_KEY_OLD` do Vercel e reverter
   `crypto.ts` para uma chave só. Deploy.

> Quando fizer isso, escrever a migração de re-cifragem como um endpoint/cron
> pontual e removê-lo depois — não deixar o caminho de 2 chaves permanente.

---

## 2. Checklist de confirmação de segredos em produção (verificação SEG-006)

**Ação manual do operador** (não auditável a partir do repo). Rodar
`vercel env ls production` e confirmar presença de:

- [ ] `AUTH_SECRET` (ou `NEXTAUTH_SECRET`) — ≥32 chars
- [ ] `ENCRYPTION_KEY` — 64 hex
- [ ] `CRON_SECRET`, `INTERNAL_SECRET` — ≥32 chars
- [ ] `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `EA_API_URL`, `EA_API_TOKEN`
- [ ] `MP_WEBHOOK_SECRET` (≥16) — **sem isso a vitrine PMB não matricula
      automaticamente** (blocker conhecido; ver memória do projeto)
- [ ] `PMB_WEBHOOK_SECRET` (≥16) — sem isso `/api/webhooks/lms` responde 503
- [ ] `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — sem isso o
      rate-limit fica desligado (buckets fail-open liberam)
- [ ] `LMS_API_URL` / `LMS_API_KEY` — se a fornecedora LMS estiver ativa

Testes de fumaça pós-confirmação:
- Entrega de teste assinada para `/api/webhooks/lms` → 200 (não 503).
- Venda de teste na vitrine PMB → matrícula automática cria.
- Login + uma rota autenticada → sessão válida (AUTH_SECRET OK).

---

## 3. Se um segredo VAZAR

1. Rotacionar imediatamente pelo §1 (o segredo específico).
2. `SUPABASE_ACCESS_TOKEN` / service_role: revogar em
   supabase.com/dashboard/account/tokens e gerar novo.
3. Se `ENCRYPTION_KEY` vazar: seguir §1.2 (rotação com re-cifragem) — não basta
   trocar a env, os dados cifrados com a chave vazada precisam ser re-cifrados.
4. Registrar o incidente e a data da rotação.
