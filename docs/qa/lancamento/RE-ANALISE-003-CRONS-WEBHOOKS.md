# Re-Analise 003 — Crons e Webhooks
**Data:** 2026-05-23
**Auditor:** backend/infra senior

## Sumario
- 6 crons + 2 webhooks (Asaas, Mercado Pago) auditados. Plataforma parceira nao expoe webhook (so polling via cron sync).
- **3 P0 / 6 P1 / OK em fluxo basico**. Idempotencia via UNIQUE constraints OK. Autenticacao CRON_SECRET OK em todos os 6 crons. Webhooks respondem 200 fast com processamento `void`.

## Crons

| Cron | Schedule | Auth | Idemp | Errors | Status |
|---|---|---|---|---|---|
| sync-cursos | 0 9 * * * | Bearer CRON_SECRET | findUnique(nome) + create/update; unique no nome | try/catch + pushSyncLog | OK |
| sync-progresso | 0 7 * * * | Bearer CRON_SECRET | filtra `progressSyncedAt` stale (>12h) | try por aluno, errors counter | OK |
| sweep-tenants-overdue | 0 3 * * * | Bearer CRON_SECRET | so pega ACTIVE com OVERDUE > gracePeriod | try por tenant; mas email/notif awaitadas | P1 |
| sweep-students-overdue | 30 3 * * * | Bearer CRON_SECRET | so ACTIVE + installmentsPaid<Total | try por enrollment | P0 (off-by-one) |
| reactivate-paid | 0 4 * * * | Bearer CRON_SECRET | so SUSPENDED + payment recente | try por tenant/enrollment | OK |
| referral-monthly-payout | 0 5 20 * * | Bearer CRON_SECRET | filtra payoutId=null | try global, sem isolation por tenant | P1 |

Todos validam `authorization: Bearer <CRON_SECRET>` e retornam 401 sem ele. Sem secret na env → 401 (fail-closed, OK).

## Findings Crons

### [CRON-P0-001] sweep-students-overdue: off-by-one no calculo de vencimento
**Path:** `src/app/api/cron/sweep-students-overdue/route.ts:76-82`
**Bug:** `expectedNextDue.setMonth(startMonth + installmentsPaid + 1)`. Quando aluno tem `installmentsPaid=1` (1a parcela paga ao comprar) e `startedAt=Jan/1`, o codigo calcula proxima parcela em Mar/1, mas o vencimento real e Fev/1. Resultado: o cron so suspende alunos com 30+ dias de atraso adicionais, dando "graca extra" oculta de ~30 dias alem do `STUDENT_GRACE_DAYS=5`.
**Fix:** trocar `+ enrollment.installmentsPaid + 1` por `+ enrollment.installmentsPaid` (linhas 78 e 100). Mesma correcao em `stillActive` (linha 100).

### [CRON-P1-001] sweep-tenants-overdue: awaits bloqueantes podem estourar 60s
**Path:** `src/app/api/cron/sweep-tenants-overdue/route.ts:95-138`
**Bug:** `await sendEmail(...).catch(...)` e `await createNotification(...)` rodam serialmente para cada tenant. Com Resend a ~1-2s/email e dezenas de tenants overdue, o cron pode exceder `maxDuration: 60`.
**Fix:** adicionar `Promise.allSettled` por tenant e/ou paginar (LIMIT batch). Aumentar `maxDuration` para 120 ou 300.

### [CRON-P1-002] sweep-students-overdue: dispara EA ate quando tenant ja esta SUSPENDED
**Path:** `src/app/api/cron/sweep-students-overdue/route.ts:46-67`
**Bug:** o where nao filtra `tenant.status != SUSPENDED`. Se um tenant ficou SUSPENDED, todos os alunos dele ja foram bloqueados via `blockTenantStudents`. O sweep individual vai chamar `blockStudentInEA` novamente (idempotente, mas desperdica request/quota).
**Fix:** adicionar `where: { student: { tenant: { status: { not: "SUSPENDED" } } } }`.

### [CRON-P1-003] sync-cursos: sem maxDuration apropriado para catalogo grande
**Path:** `src/app/api/cron/sync-cursos/route.ts:4`
**Bug:** `maxDuration=60`. Sync sequencial de cursos faz 1 findUnique + 1 conflict-check + 1 update/create por curso (~3 queries/curso). 200 cursos = ~600 queries serializadas. Pode timeout se a plataforma demora.
**Fix:** paralelizar com `Promise.all` em batches de 10 cursos, ou aumentar `maxDuration: 300`.

### [CRON-P1-004] referral-monthly-payout: sem try/catch por referrer
**Path:** `src/lib/referrals/payout.ts:301-365`
**Bug:** uma falha em `prisma.referralPayout.create` para 1 referrer aborta o loop e nao processa os demais. O cron usa try/catch global so no route handler.
**Fix:** envolver o bloco `for (const [tenantId, ...])` com try/catch por iteracao, acumulando erros num array como nos outros sweeps.

### [CRON-P1-005] sync-progresso: STALE_HOURS=12 + BATCH=100 nao processa todos os alunos diarios
**Path:** `src/app/api/cron/sync-progresso/route.ts:8-10`
**Bug:** se houver >100 alunos com progresso stale, so 100 sao processados por execucao (cron diario 7h). Os 200 backlog acumulam.
**Fix:** rodar a cada 6h em vez de 24h, ou aumentar BATCH_SIZE para 500 com BATCH_SIZE*4=2000 candidates.

## Webhooks

### Asaas
- **Eventos tratados:** `PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`, `PAYMENT_OVERDUE`, `PAYMENT_REFUNDED`, `PAYMENT_PARTIALLY_REFUNDED`, `PAYMENT_DELETED`, `PAYMENT_CREATED`/`PAYMENT_UPDATED` (no-op). **NAO tratados:** `SUBSCRIPTION_CREATED`, `SUBSCRIPTION_DELETED`, `SUBSCRIPTION_UPDATED`, `PAYMENT_AWAITING_RISK_ANALYSIS`, `PAYMENT_RECEIVED_IN_CASH`.
- **Validacao:** `validateAsaasWebhook` confere header `asaas-access-token`. Em prod sem `ASAAS_WEBHOOK_TOKEN` → rejeita. OK.
- **Idempotencia:** `TenantPayment.asaasPaymentId @unique` + `Payment.asaasPaymentId @unique` + `fulfillEnrollment` checa Payment antes de processar. OK.
- **Async + 200 fast:** retorna 200 antes de processar (`void processAsaasWebhook(...)`). OK <22s.

### Mercado Pago
- **Topics tratados:** `payment`, `subscription_authorized_payment` (resolve payment_id via API antes de processar). **NAO tratados:** `subscription_preapproval` (criacao/cancelamento de assinatura), `merchant_order`.
- **Validacao:** HMAC v1 conferida via `validateMpWebhookSignature` (timingSafeEqual). Defesa anti-flood: rejeita sem `x-signature`+`x-request-id` em prod.
- **Idempotencia:** `Payment.mpPaymentId @unique` + check inicial `prisma.payment.findUnique`. OK.
- **Multi-tenant:** identifica tenant por `?tenant=<slug>` no query da notification_url. Sem slug = vitrine PMB.
- **Status nao-approved:** ignora `in_process`/`rejected` etc. — espera novo webhook. OK.

## Findings Webhooks

### [WH-P0-001] MP webhook usa secret GLOBAL para todos os tenants
**Path:** `src/lib/mercadopago/process.ts:165`
**Bug:** `const secret = process.env.MP_WEBHOOK_SECRET`. Cada revendedor configura SEU proprio MP webhook secret no painel MP — o HMAC chega assinado com a chave do tenant, mas o codigo so usa uma chave global PMB. Resultado: **TODOS os webhooks de revendedores falhariam HMAC em producao** (a menos que cada tenant use o mesmo secret PMB, o que e impossivel — cada conta MP tem secret proprio).
**Fix:** ler `tenant.mpWebhookSecret` (adicionar coluna criptografada no schema Tenant), usar esse valor em vez do env. Para PMB usa o env. Migrar revendedores existentes para cadastrarem o secret durante "Conectar MP".

### [WH-P0-002] MP webhook: `subscription_preapproval` ignorado silenciosamente
**Path:** `src/lib/mercadopago/process.ts:119-217`
**Bug:** quando aluno cancela assinatura no MP (`subscription_preapproval` com status=cancelled), o webhook chega mas o codigo so trata payments diretos. Resultado: o enrollment fica ACTIVE no nosso banco, aluno mantem acesso na plataforma parceira mesmo apos cancelar.
**Fix:** adicionar branch para topic=`subscription_preapproval` que GET no preapproval, identifica enrollment por `mpSubscriptionId` e marca `status=CANCELLED` se necessario.

### [WH-P0-003] Asaas: nenhum evento `SUBSCRIPTION_*` tratado
**Path:** `src/lib/asaas/process.ts:192-426`
**Bug:** quando revendedor cancela subscription (downgrade), Asaas envia `SUBSCRIPTION_DELETED` ou `SUBSCRIPTION_INACTIVATED`. O switch nao trata — o tenant continua ACTIVE indefinidamente. Vai detectar so quando a proxima cobranca vencer (via sweep), com 3+ dias de delay.
**Fix:** adicionar case `SUBSCRIPTION_INACTIVATED`/`SUBSCRIPTION_DELETED` → suspende tenant imediatamente + notifica admin. Para PMB-direct (alunos com asaasSubscriptionId), suspende enrollment.

### [WH-P1-001] Asaas: processamento PMB nao notifica em PAYMENT_OVERDUE
**Path:** `src/lib/asaas/process.ts:108-117`
**Bug:** quando aluno PMB com Asaas-MONTHLY atrasa mensalidade, `processPmbDirectSale` so faz `enrollment.update({status:"SUSPENDED"})`. Nao bloqueia aluno na plataforma parceira nem notifica.
**Fix:** chamar `blockStudentInEA(enrollment.studentId)` apenas se nao houver outra matricula ACTIVE; criar notification para o aluno (mesma logica do sweep-students-overdue).

### [WH-P1-002] Asaas: race em `tenantPayment.upsert` quando webhook chega antes do tenant existir
**Path:** `src/lib/asaas/process.ts:170-190`
**Bug:** o upsert usa `where: asaasPaymentId` (unique), `create: { tenantId: tenant.id, ... }`. Se webhook PAYMENT_CREATED chega antes do tenant ser persistido no onboarding (rara, mas possivel com race no signup), o lookup `tenant` retorna null e o webhook e marcado processed:true SEM gravar TenantPayment. Em retries, o evento ja vai estar logado mas a cobranca nao registrada. Auditoria perdida.
**Fix:** gravar TenantPayment com `tenantId=null` num modelo de "orfaos" pendentes ou retornar 503 para o Asaas re-enviar; mas o caminho atual ja loga corretamente o `webhookLog`, entao a auditoria existe — so falta backfill manual.

### [WH-P1-003] Asaas: ausencia de retry/backoff em falhas externas
**Path:** `src/lib/asaas/process.ts:434` (catch global)
**Bug:** se `blockTenantStudents` falha em 5 alunos de 20, o webhookLog fica `processed:false` mas o tenant ja foi suspenso. Nao ha mecanismo de retry — depende do sweep-tenants-overdue rodar de novo.
**Fix:** adicionar job de retry via cron `process-failed-webhooks` que pega `webhookLog.processed=false` com idade <24h e reenfila o `processAsaasWebhook`.

## Plataforma Parceira
Nenhum webhook exposto. Sincronizacao e via polling (cron `sync-cursos` 9h + `sync-progresso` 7h). OK por design.

## CRON_SECRET — verificacao adicional
Todos os 6 cron route.ts (`sync-cursos`, `sync-progresso`, `sweep-tenants-overdue`, `sweep-students-overdue`, `reactivate-paid`, `referral-monthly-payout`) validam header `authorization: Bearer ${CRON_SECRET}` e retornam 401 sem ele. **Nenhum endpoint extra usa CRON_SECRET fora desses crons.**
