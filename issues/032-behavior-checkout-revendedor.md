# Issue 032 — Checkout Revendedor: Cadastro Completo

**Tipo:** behavior
**Página:** /seja-revendedor/checkout
**Depende de:** 003, 022, 025
**Prioridade:** P1

## O Que Fazer

Implementar multi-step checkout revendedor. Validar dados, criar User RESELLER no banco, criar customer Asaas, criar subscription Asaas, redirecionar para pagamento.

## Componentes Envolvidos
- FormCadastro (do proto 003) com validação multi-step
- POST /api/revendedores/cadastro — criar User + Tenant
- Asaas client: create customer, create subscription
- Webhook Asaas PAYMENT_RECEIVED tratará ativação
- Redirect para payment link Asaas

## Comportamentos
- `submit-step-1` — validar dados pessoais (Zod)
- `submit-step-2` — validar dados empresa (Zod)
- `submit-step-3` — validar dados pagamento
- `submit-step-4` — enviar tudo POST /api/revendedores/cadastro
- `create-user-tenant` — Prisma User + Tenant
- `create-asaas-customer` — Asaas POST /customers
- `create-asaas-subscription` — Asaas POST /subscriptions
- `redirect-payment` — navegar para payment link Asaas

## Critério de Aceite
- [ ] FormCadastro 4 steps navegáveis
- [ ] Zod schemas para cada step (pessoa, empresa, pagamento, confirmação)
- [ ] POST /api/revendedores/cadastro implementado
- [ ] Cria User (role=RESELLER, email, password hashed)
- [ ] Cria Tenant { company_name, user_id, status: PENDING }
- [ ] POST Asaas /customers { name, email, phone, cpf }
- [ ] POST Asaas /subscriptions { customer_id, billingType, value, nextDueDate }
- [ ] Armazena asaas_customer_id e asaas_subscription_id em Tenant
- [ ] Redirect para Asaas payment link após criaçao subscription
- [ ] Se erro em qualquer step, exibir mensagem erro
- [ ] Form reseta se voltar de payment (session handling)
