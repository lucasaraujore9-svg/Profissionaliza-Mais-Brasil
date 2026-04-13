# Issue 050 — Webhook Asaas: PAYMENT_RECEIVED + PAYMENT_OVERDUE

**Tipo:** integration
**Página:** global
**Depende de:** 020, 025
**Prioridade:** P0

## O Que Fazer

Implementar endpoint webhook Asaas para processar eventos de pagamento. Valida token asaas-access-token header, log webhook_logs, processa PAYMENT_RECEIVED (ativar tenant), PAYMENT_OVERDUE (notificar admin).

## Componentes Envolvidos
- POST /api/webhooks/asaas — webhook endpoint
- lib/asaas/webhook.ts — validação e processamento
- Webhook_logs table — log todas requests
- Email notificação admin

## Comportamentos
- `validate-webhook-token` — verificar header asaas-access-token
- `parse-payment-received` — ativar tenant status
- `parse-payment-overdue` — notificar admin
- `return-200-immediate` — responder 200 em <22s
- `process-async` — processar em background

## Critério de Aceite
- [ ] POST /api/webhooks/asaas implementado
- [ ] Valida asaas-access-token header == ASAAS_WEBHOOK_TOKEN
- [ ] Se token inválido, retorna 401
- [ ] Log request em webhook_logs { event_type, payload, status, error }
- [ ] Retorna 200 imediato (antes processar)
- [ ] Parse PAYMENT_RECEIVED: query Tenant.asaas_subscription_id
- [ ] Atualiza Tenant { status: ACTIVE, subscription_status: ACTIVE }
- [ ] Parse PAYMENT_OVERDUE: Tenant { status: OVERDUE }
- [ ] Envia email notificação admin com detalhes
- [ ] Async processing (não bloqueia response)
- [ ] Retry logic se DB falha
- [ ] Logging completo para debug
