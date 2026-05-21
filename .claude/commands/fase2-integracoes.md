# DEPRECATED — Use /plan, /execute, /status, /next, /review instead

Este arquivo e legado. Os comandos foram refatorados para seguir o workflow SPEC→BREAK→PLAN→EXECUTE:

- **/setup** — Inicializar projeto do zero
- **/plan** — Planejar uma issue antes de executar
- **/execute** — Executar uma issue planejada
- **/status** — Ver status do projeto
- **/next** — Sugerir proxima issue para executar
- **/review** — Revisar codigo de uma issue completada

Nao use este arquivo. Ele foi substituido.
- listarCobrancas(subscriptionId)

Criar `src/lib/asaas/webhooks.ts`:
- validarWebhook(headers, expectedToken) → boolean
- parseWebhookPayload(body) → tipado

Criar `src/lib/asaas/types.ts`

### 3. Client do Mercado Pago
Criar `src/lib/mercadopago/client.ts`:
- Funcao factory: createMPClient(accessToken) → retorna client com token do REVENDEDOR
- Usar SDK oficial `mercadopago` onde possivel

Criar `src/lib/mercadopago/preferences.ts`:
- criarPreferencia(accessToken, item, payer, backUrls, externalRef, notificationUrl)
- buscarPagamento(accessToken, paymentId)

Criar `src/lib/mercadopago/subscriptions.ts`:
- criarPlano(accessToken, dados)
- criarAssinatura(accessToken, planoId, payerEmail, externalRef)
- buscarAssinatura(accessToken, id)

Criar `src/lib/mercadopago/webhooks.ts`:
- validarHMAC(xSignature, xRequestId, dataId, secret) → boolean
- parseWebhookPayload(body)

Criar `src/lib/mercadopago/types.ts`

### 4. Webhook Endpoints
Criar `src/app/api/webhooks/asaas/route.ts`:
- POST handler
- Validar token do header
- Logar em webhook_logs
- Processar: PAYMENT_RECEIVED → ativar tenant, PAYMENT_OVERDUE → notificar admin
- Retornar 200 IMEDIATO, processar em background

Criar `src/app/api/webhooks/mercadopago/route.ts`:
- POST handler
- Validar HMAC SHA256
- Logar em webhook_logs
- GET payment details
- Processar: approved → matricular aluno (fluxo completo plataforma)
- Retornar 200 IMEDIATO

### 5. Cron: Sync de Cursos
Criar `src/app/api/cron/sync-cursos/route.ts`:
- GET handler protegido por CRON_SECRET
- Chama plataforma cursos/listar
- Compara com banco local
- Insere novos, atualiza existentes, soft-delete removidos
- Para cada novo: buscar aulas via cursos/aulas
- Logar resultado

Configurar em `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/cron/sync-cursos",
    "schedule": "0 6 * * *"
  }]
}
```

### 6. Verificacao
- Client plataforma: testar parse de preco BR, tipagem correta
- Client Asaas: testar criacao de customer/subscription (sandbox)
- Client MP: testar criacao de preferencia
- Webhooks: testar com payload mock
- Cron: executar manualmente e verificar sync

### COMMIT
```bash
git add . && git commit -m "feat: API clients (plataforma, Asaas, MP) + webhooks + cron sync"
```
