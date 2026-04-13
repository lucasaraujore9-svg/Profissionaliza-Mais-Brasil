# Issue 003 — Checkout Revendedor Prototype

**Tipo:** proto
**Página:** /seja-revendedor/checkout
**Depende de:** nenhuma
**Prioridade:** P0

## O Que Fazer

Criar página de checkout multi-step para revendedores. UI com formulário wizard, resumo plano, progress bar. Dados hardcoded, sem API calls.

## Componentes Envolvidos
- ProgressBar — 4 steps: Dados Pessoais, Empresa, Pagamento, Confirmação
- FormCadastro — form com campos para dados pessoais e empresa (inputs vazios)
- ResumoPlano — card com plano selecionado, preço, features
- StepNavigation — botões Anterior, Próximo
- PaymentPreview — mock payment method display

## Comportamentos
- `render-step-1` — exibir step dados pessoais
- `click-next` — ir para próximo step
- `click-previous` — voltar para step anterior
- `progress-update` — barra de progresso atualiza

## Critério de Aceite
- [ ] ProgressBar exibe 4 steps, step 1 ativo por padrão
- [ ] FormCadastro renderiza com inputs para nome, email, CPF, empresa, CNPJ
- [ ] ResumoPlano mostra plano com preço hardcoded
- [ ] Botões Anterior e Próximo estilizados (Anterior desabilitado no step 1)
- [ ] Ao clicar Próximo, muda visualmente para step 2
- [ ] Ao clicar Anterior, volta para step anterior
- [ ] Progress bar atualiza conforme navegação
- [ ] Layout responsivo
- [ ] Dados não são persistidos (tudo é visual)
