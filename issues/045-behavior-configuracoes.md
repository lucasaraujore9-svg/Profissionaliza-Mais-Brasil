# Issue 045 — Configurações + Onboarding Revendedor

**Tipo:** behavior
**Página:** /painel/configuracoes, /painel/onboarding
**Depende de:** 015, 022, 027
**Prioridade:** P1

## O Que Fazer

Implementar configurações e onboarding revendedor: atualizar conta, toggle modo faturamento, conectar Mercado Pago (OAuth ou token manual), trocar senha, wizard onboarding 5 steps.

## Componentes Envolvidos
- GET /api/painel/config — carregar config revendedor
- PUT /api/painel/config — atualizar conta, modo faturamento
- POST /api/painel/config/connect-mp — salvar token MP (criptografar)
- PUT /api/painel/config/password — mudar senha
- POST /api/painel/onboarding — marcar step como completo

## Comportamentos
- `load-config-tabs` — GET /api/painel/config
- `update-account` — PUT /api/painel/config { name, email, company }
- `toggle-billing-mode` — PATCH /api/painel/config/billing-mode { mode: AUTO/MANUAL }
- `connect-mp` — POST /api/painel/config/connect-mp { access_token }
- `update-password` — PUT /api/painel/config/password { current, new, confirm }
- `navigate-onboarding-steps` — POST /api/painel/onboarding { step, completed }

## Critério de Aceite
- [ ] GET /api/painel/config implementado
- [ ] ConfigTabs renderiza 3 tabs (Conta, Pagamento, Segurança)
- [ ] AccountForm com inputs nome, email, empresa
- [ ] PUT /api/painel/config atualiza User/Tenant
- [ ] BillingModeToggle funciona
- [ ] PATCH /api/painel/config/billing-mode { mode }
- [ ] Atualiza Tenant.billing_mode (AUTO/MANUAL)
- [ ] MPConnectionCard com botão "Conectar MP"
- [ ] POST /api/painel/config/connect-mp salva token
- [ ] Criptografa token com AES-256-GCM
- [ ] Armazena em Tenant.mp_access_token_encrypted
- [ ] PasswordForm com validação
- [ ] PUT /api/painel/config/password { current, new }
- [ ] OnboardingWizard com 5 steps (Boas-vindas, Conta, Domínio, Vitrine, Conclusão)
- [ ] Navegação steps funciona
- [ ] POST /api/painel/onboarding marca step como completed
