# Issue 025 — Asaas API Client

**Tipo:** integration
**Página:** global
**Depende de:** nenhuma
**Prioridade:** P0

## O Que Fazer

Implementar client API Asaas com endpoints customer, subscription, payment. JSON REST padrão, auth via header access_token, webhook validation token, error handling.

## Componentes Envolvidos
- lib/asaas/client.ts — main Asaas API client
- lib/asaas/endpoints.ts — endpoints customer, subscription, payment
- lib/asaas/types.ts — tipos Asaas responses
- lib/asaas/webhook.ts — webhook validation logic

## Comportamentos
- `create-customer` — POST /customers (para revendedor)
- `create-subscription` — POST /subscriptions (assinatura mensal)
- `list-payments` — GET /payments (histórico pagamentos)
- `get-payment` — GET /payments/{id}
- `validate-webhook-token` — verificar asaas-access-token header
- `parse-webhook-event` — processar PAYMENT_RECEIVED, PAYMENT_OVERDUE

## Critério de Aceite
- [ ] lib/asaas/client.ts criado
- [ ] POST /customers implementado
- [ ] POST /subscriptions implementado
- [ ] GET /payments implementado
- [ ] GET /payments/{id} implementado
- [ ] Auth via header access_token (ASAAS_API_KEY)
- [ ] Error handling com custom exceptions
- [ ] Webhook validation com token asaas-access-token header
- [ ] TypeScript tipos para request/response
- [ ] Retry logic para falhas de rede
- [ ] Logging em dev mode
