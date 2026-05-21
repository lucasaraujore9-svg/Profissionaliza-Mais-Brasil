# Issue 007 — Checkout Aluno + Confirmação Prototype

**Tipo:** proto
**Página:** /loja/checkout, /loja/confirmacao
**Depende de:** nenhuma
**Prioridade:** P0

## O Que Fazer

Criar página de checkout do aluno e confirmação de compra. Componentes: resumo pedido, form dados pessoais, seleção método pagamento, botão checkout, página de sucesso. Dados hardcoded.

## Componentes Envolvidos
- OrderSummary — card com curso, preço total, desconto aplicado
- StudentForm — inputs: nome, email, CPF, telefone, endereço
- PaymentInfo — radio buttons: Crédito, Débito, PIX (visual apenas)
- CheckoutButton — botão "Finalizar Compra"
- SuccessIcon — ícone sucesso (checkmark animado)
- ConfirmationCard — resumo compra, número pedido, próximos passos
- NextSteps — instruções: "Você será redirecionado à plataforma parceira"

## Comportamentos
- `render-checkout` — exibir form checkout
- `render-confirmacao` — exibir página sucesso
- `select-payment-method` — clicar radio button método pagamento
- `scroll-to-summary` — summary fica sticky em scroll

## Critério de Aceite
- [ ] OrderSummary renderiza com curso, preço, desconto
- [ ] StudentForm tem inputs: nome, email, CPF, telefone, endereço
- [ ] PaymentInfo mostra 3 opções pagamento (visual)
- [ ] CheckoutButton estilizado e clicável
- [ ] Página /loja/confirmacao exibe SuccessIcon
- [ ] ConfirmationCard mostra resumo e número pedido mock
- [ ] NextSteps exibe instruções próximas ações
- [ ] Layout responsivo
- [ ] Dados não persistem (tudo visual)
- [ ] Tipografia e cores corretas
