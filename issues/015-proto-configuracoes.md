# Issue 015 — Configurações + Onboarding Prototype

**Tipo:** proto
**Página:** /painel/configuracoes, /painel/onboarding
**Depende de:** nenhuma
**Prioridade:** P0

## O Que Fazer

Criar página de configurações do revendedor e wizard onboarding. Componentes: tabs configuração (conta, pagamento, senha), cards integração, password form, e wizard 5 steps. Dados hardcoded.

## Componentes Envolvidos
- ConfigTabs — 3 tabs: Conta, Pagamento, Segurança
- AccountForm — inputs: nome, email, empresa, CNPJ (readonly alguns)
- BillingModeToggle — toggle: Automático / Manual (bloqueio alunos)
- MPConnectionCard — card exibindo status conexão Mercado Pago, botão "Conectar"
- PasswordForm — inputs: senha atual, nova senha, confirmar
- OnboardingWizard — 5 steps: Boas-vindas, Conta, Domínio, Vitrine, Conclusão
- StepIndicator — visual progress dos 5 steps

## Comportamentos
- `render-config-tabs` — exibir tabs configuração
- `toggle-billing-mode` — mudar entre automático/manual
- `click-conectar-mp` — botão conexão MP clicável
- `navigate-wizard-steps` — botões próximo/anterior
- `update-password` — form senha clicável

## Critério de Aceite
- [ ] ConfigTabs com 3 tabs visíveis
- [ ] AccountForm com inputs corretos
- [ ] BillingModeToggle toggle visível
- [ ] MPConnectionCard exibe status e botão
- [ ] PasswordForm com 3 inputs
- [ ] OnboardingWizard renderiza com 5 steps
- [ ] StepIndicator mostra progress visual
- [ ] Botões próximo/anterior navegam steps
- [ ] Cada step tem conteúdo diferente
- [ ] Layout responsivo
