# Venda direta parcelada — o aluno escolhe o meio — desenho

Data: 2026-11-06 · Status: rascunho para aprovação do dono

## Por que

Hoje a venda direta parcelada de curso tem dois caminhos, e quem decide é o
VENDEDOR, na hora da venda:

- **Mensal** (`paymentType = MONTHLY`): só cartão, recorrência do gateway
  (assinatura no Asaas, `preapproval` no Mercado Pago).
- **Carnê** (`paymentType = BOLETO_INSTALLMENT`): boletos. Na loja de unidade
  Asaas, a página da parcela já aceita PIX/cartão/boleto; no Mercado Pago e na
  PMB (`/admin/vendas`), só boleto.

O aluno fica preso ao que o vendedor escolheu. O dono quer **um só tipo de
venda parcelada**, em que **o aluno escolhe o meio na página de pagamento**,
nos dois gateways e em todas as portas (loja da unidade e PMB).

## Decisões do dono (2026-11-06)

1. A venda direta parcelada vira uma só: o vendedor NÃO escolhe o meio de
   pagamento. O aluno escolhe no link (`/pagar/<id>`).
2. Meios: **cartão, PIX ou boleto**, no Asaas e no Mercado Pago.
3. **Cartão = assinatura no gateway**, cobrança automática todo mês
   (assinatura no Asaas, `preapproval` no Mercado Pago).
4. **PIX ou boleto = a plataforma gera cada parcela** e cobra pelo gateway
   (no Mercado Pago não há recorrência de PIX/boleto pela API).
5. **O meio escolhido vale para as parcelas seguintes.** O aluno só troca de
   meio quando a cobrança do **cartão é negada**: aí a parcela negada abre
   PIX, boleto e cartão. O meio que ele usar para pagá-la passa a valer para
   as seguintes (pagou no cartão → segue como assinatura; pagou no PIX/boleto
   → as próximas saem nesse meio, geradas pela plataforma).
6. **Parcelas sempre do mesmo valor.** O vendedor pode definir uma
   **entrada** de valor diferente + N parcelas iguais.
7. **Entrada e parcelas podem ter meios diferentes** (ex.: entrada no PIX,
   parcelas no cartão).

## Chamadas minhas (sem objeção do dono, ainda checáveis)

- "Parcelado" **substitui** "Mensal" e "Carnê" no formulário de venda direta
  (`/painel/vendas` e `/admin/vendas`). Vendas antigas seguem exatamente como
  estão — nada de migrar matrícula existente.
- **"Personalizar valores"** (um valor por parcela, de 29/10) **sai do
  formulário de venda**: entrada + parcelas iguais cobre o caso. O botão
  "Parcelas" da ficha do aluno (renegociar valor/vencimento depois da venda,
  `lib/installments/edit.ts`) **fica**.
- **"1ª mensalidade já paga fora"** continua, dentro do Parcelado: a parcela 1
  nasce paga, sem cobrança; o aluno escolhe o meio a partir da 2ª.
- Aviso por **e-mail** ao aluno quando o cartão é negado, com o link da
  parcela. Bloqueio por atraso segue a regra atual (`Tenant.billingMode`,
  `auto-block.ts`, `pace-gate.ts`).
- **Pix Automático fica fora da v1.** PIX = PIX comum por parcela, QR gerado
  ao vivo na página (como `openCarnePix` da assinatura). Entra depois se o
  dono pedir. (Na conversa eu tinha dito que entraria; recuei para reduzir o
  tamanho — o dono pode reverter.)
- **Entrada no cartão = 1x.** Não parcela a entrada de novo.
- **Vitrine não muda**: continua cobrando o total à vista (decisão de
  2026-11-05). Assinatura de planos (`StudentSubscription`) não muda.
- **1ª cobrança é imediata, como hoje.** A entrada (ou, sem entrada, a
  parcela 1) se paga ao abrir o link, em qualquer meio — `isWithinRevealWindow`
  já libera a nº 1 sempre. Cartão escolhido nessa hora: assinatura começa
  cobrando JÁ (igual ao MONTHLY, `dueDateInDays(0)`). O curso é liberado no
  1º pagamento confirmado (entrada ou parcela 1), pelo `fulfillEnrollment` de
  sempre.
- **Entrada vence na venda; o "1º vencimento" do formulário é o da parcela 1**
  (padrão: um mês depois da venda). Enquanto a entrada não for paga, a página
  só mostra a entrada — as parcelas não abrem e o meio delas não é escolhido.
- **Plano no cartão não edita linha avulsa.** O botão "Parcelas" recusa
  editar parcela de plano com assinatura ativa ("plano no cartão: valor fixo
  da assinatura"). Plano em PIX/boleto edita como hoje. Renegociar plano no
  cartão fica para depois, se aparecer o caso.
- **E-mail "parcela disponível" para PIX/boleto** quando a linha abre (7 dias
  antes), com o link — hoje o sweep do carnê não avisa ninguém, e no PIX não
  há cobrança enviada pelo gateway. **Envio espaçado, nunca em rajada**: o
  SMTP da Hostinger suspende as 5 caixas com envio em massa.

## O que o aluno vê

Página `/pagar/<id>` (loja `src/app/loja/pagar/[id]/page.tsx` e PMB
`src/app/(main)/pagar/[id]/page.tsx`), mesmo comportamento nas duas:

- Topo: **"Parcela K de N · R$ X"** — a parcela da vez de verdade (hoje está
  fixo em 1 no painel do MP e da PMB). Com entrada: "Entrada · R$ E" e depois
  "Parcela K de N".
- Resumo: "Entrada R$ E + N× R$ X · total R$ T" (sem entrada: "N× R$ X ·
  total R$ T"). Nunca "N× <valor da parcela atual>" quando os valores
  diferem.
- Lista de todas as parcelas embaixo: paga, em aberto, futura ("disponível em
  dd/mm"), negada.
- O que a parcela da vez oferece depende do estado do plano:

| Estado do plano | A parcela da vez oferece |
|---|---|
| Meio ainda não escolhido (1ª parcela, ou 1ª depois da entrada, ou depois de "paga fora") | PIX, boleto, cartão. Cartão = cadastrar assinatura para esta e as restantes. |
| Entrada em aberto | PIX, boleto, cartão (1x). Pagar a entrada NÃO define o meio das parcelas. |
| Meio = PIX | Só PIX (QR ao vivo). |
| Meio = boleto | Só boleto (PDF + linha digitável; nunca a fatura hospedada). |
| Meio = cartão, tudo em dia | Nada a pagar: "cobrança automática no cartão final XXXX, próxima em dd/mm". |
| Meio = cartão, cobrança da parcela NEGADA | PIX, boleto, cartão (outro cartão). O meio usado vira o meio das próximas. |

## Como (decidido aqui; detalhes de implementação ficam para o plano)

### Reusar o carnê de curso como livro de parcelas

As linhas de `BoletoInstallment` (uma por parcela, `number`, `amount`,
`dueDate`, `status`) passam a ser o registro de TODAS as parcelas do plano,
qualquer que seja o meio — inclusive as pagas pela assinatura do cartão. É o
mesmo movimento que a assinatura fez em 2026-09-29 (`boletoCarne` passou a
significar "a plataforma emite cada ciclo"; o nome ficou do 1º uso).

- `paymentType` continua `BOLETO_INSTALLMENT`, para não reabrir todo `switch`
  que já trata carnê (pace-gate, auto-block, sweep, edit, cancel, relatórios).
- **Discriminador explícito** na matrícula para a venda nova (ex.:
  `Enrollment.installmentMethod` nulo/CARD/PIX/BOLETO + uma marca de "plano
  flexível"). **Nada de inferir** pelo formato dos dados: carnê antigo, sem a
  marca, segue o código de hoje. Migration aditiva, idempotente, **sem
  backfill**.
- Por linha, o que precisar para o estado "negada" e para saber qual cobrança
  do gateway pagou aquela parcela (ids de pagamento por linha já existem:
  `mpPaymentId`, `asaasPaymentId`).

### Emissão

- **PIX/boleto**: a plataforma emite a cobrança da linha quando ela entra na
  janela de 7 dias (`isWithinRevealWindow`), pelo cron que já existe
  (`sweep-boleto-installments` / `runBoletoInstallmentSweep`) — **sem job novo
  de pg_cron**. Vale para os DOIS gateways (o carnê Asaas de hoje emite tudo
  na venda; o plano flexível não pode, porque o meio ainda não é conhecido).
  PIX: QR lido/emitido ao vivo na página (o QR expira).
- **Cartão**: assinatura no gateway sobre as linhas restantes, valor = valor
  da parcela (por isso as parcelas são iguais), `maxPayments`/`end_date` = nº
  de linhas restantes. Cada cobrança da assinatura que chega no webhook baixa
  a próxima linha em aberto. Reaproveitar o que o MONTHLY já faz
  (`asaas/transparent-process.ts` e `mercadopago/transparent-process.ts`,
  ramo `MONTHLY`).
- **Rateio (split Asaas)** em TODA cobrança — linha avulsa e assinatura — via
  `asaasSplitsForEnrollment`. Esquecer o split = produtor nunca recebe.

### Cartão negado

- Detectar a recusa nos dois gateways (Asaas: evento de captura recusada /
  cobrança vencida da assinatura; Mercado Pago: `authorized_payment` recusado
  do `preapproval`). Hoje nenhum fluxo trata isso explicitamente — o plano
  precisa confirmar os eventos reais na documentação de cada gateway.
- **Cancela a assinatura na 1ª recusa** (chamada minha; o dono delegou).
  Perde-se a retentativa automática do gateway, em troca de: o aluno pode
  pagar por outro meio no mesmo dia, o aviso sai igual nos dois gateways e a
  trava contra cobrança dupla fica num ponto só. Só depois do cancelamento
  CONFIRMADO a linha vira negada e abre os três meios.
- Ao detectar: cancela a assinatura, marca a linha como negada, manda o
  e-mail com o link.
- **Invariante: nunca cobrar a mesma parcela duas vezes.** Antes de emitir
  PIX/boleto para uma linha negada, a recorrência do gateway tem que estar
  parada (cancelada, com confirmação do gateway — DELETE do Asaas é soft,
  só `deleted: true` prova). Se o gateway ainda vai retentar o cartão, o
  aluno não pode pagar por fora ao mesmo tempo.
- Pagou a linha negada no cartão (mesmo ou outro) → nova assinatura para as
  restantes. Pagou no PIX/boleto → meio do plano vira esse, linhas seguintes
  emitidas pela plataforma.

### Venda direta (`/painel/vendas`, `/admin/vendas`)

- Campos: curso(s), nº de parcelas, entrada opcional (valor), 1º vencimento,
  "1ª paga fora" (opcional). Sem escolha de meio.
- Total abaixo do preço da vitrine continua passando pelo teto de desconto do
  vendedor (`effectiveSalesCap`) — inclusive no painel, onde o carnê hoje pula
  o teto (dívida registrada em 2026-10-29).
- Piso de R$ 5 por parcela (`MIN_INSTALLMENT_AMOUNT`).
- Nada é cobrado no gateway na venda: o link vai para o aluno.

## Restrições e invariantes que já existem (não quebrar)

- Link de pagamento é sempre página da plataforma, nunca fatura hospedada,
  `init_point` nem `ticket_url` (`payment-link-coverage.test.ts`, lista
  fechada).
- Mercado Pago: boleto/PIX vencido chega como `cancelled`, que o tratamento
  genérico lê como estorno. Referência por linha + liberação da linha para
  reemissão (padrão de `carne-webhook.ts` da assinatura).
- Mercado Pago boleto exige endereço completo do pagador.
- Asaas não tem idempotência: emissão adota cobrança órfã de tentativa
  anterior (padrão `findOrphanAsaasCharge`).
- Lock por linha: venda, página e cron nunca emitem a mesma linha ao mesmo
  tempo.
- Aluno menor: cobrança no CPF do responsável financeiro (`resolvePayer`).
- Toda mudança de preço/parcela auditada em `audit_logs`.

## Objetivos / não-objetivos / anti-objetivos

- **Objetivo:** venda direta parcelada única, aluno escolhe o meio, dois
  gateways, loja e PMB; texto da página sempre bate com o que será cobrado.
- **Não-objetivo:** vitrine, assinatura de planos, Pix Automático, migrar
  vendas antigas, parcelar a entrada no cartão.
- **Anti-objetivos (falha mesmo funcionando):** parcela cobrada duas vezes;
  cobrança sem split; aluno vendo valor diferente do que será cobrado; carnê
  ou mensal antigo mudando de comportamento.

## O que fica para o plano

- Nomes de colunas/enum e formato exato da migration.
- Como mapear cada cobrança da assinatura para a linha certa (ordem,
  vencimento, referência).
- Eventos exatos de recusa em cada gateway.
- Texto e template dos e-mails (cartão negado, parcela disponível).
- Quebra em issues (`issues/NNN-*.md`) e ordem de entrega.
- Testes: funções puras para "o que a parcela da vez oferece" (tabela acima),
  mapeamento cobrança → linha, cálculo entrada + parcelas; testes de rota para
  o invariante de não cobrar em dobro.

## Validação

Nada disso foi validado contra os gateways reais. Teste real em produção com
cartão/PIX/boleto de valor baixo, nos dois gateways, antes de anunciar às
unidades. O checkout está atrás do BotID: teste com Chrome real, não
Playwright headless.
