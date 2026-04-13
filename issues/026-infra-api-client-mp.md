# Issue 026 — Mercado Pago API Client

**Tipo:** integration
**Página:** global
**Depende de:** nenhuma
**Prioridade:** P0

## O Que Fazer

Implementar client API Mercado Pago com endpoints preference (criar pagamento), payment (GET detalhes), subscription (recorrente). Token por tenant (criptografado no DB), webhook HMAC SHA256 validation.

## Componentes Envolvidos
- lib/mercadopago/client.ts — main MP API client
- lib/mercadopago/endpoints.ts — endpoints preference, payment, subscription
- lib/mercadopago/types.ts — tipos MP responses
- lib/mercadopago/webhook.ts — webhook HMAC validation
- lib/mercadopago/utils.ts — utilidades MP (IPN parsing, etc)

## Comportamentos
- `create-preference` — POST /checkout/preferences (pagamento único/recorrente)
- `get-payment` — GET /v1/payments/{id} (detalhes pagamento)
- `get-subscription` — GET /v1/preapproval/{id} (detalhes assinatura)
- `decode-encrypted-token` — usar AES-256-GCM para decriptar token do DB
- `validate-webhook-hmac` — validar assinatura HMAC SHA256
- `parse-payment-id-from-notification` — webhook envia só ID, fazer GET

## Critério de Aceite
- [ ] lib/mercadopago/client.ts criado
- [ ] POST /checkout/preferences implementado
- [ ] GET /v1/payments/{id} implementado
- [ ] GET /v1/preapproval/{id} implementado
- [ ] Auth usa Bearer Token (decriptado per-tenant)
- [ ] mp_access_token por tenant em Tenant.mp_access_token_encrypted
- [ ] Webhook HMAC SHA256 validation
- [ ] Webhook retorna só payment ID, faz GET para detalhes
- [ ] Error handling custom
- [ ] TypeScript tipos
- [ ] Retry logic para falhas rede
