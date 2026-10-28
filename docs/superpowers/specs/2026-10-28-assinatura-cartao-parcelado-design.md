# Assinatura parcelada no cartão — desenho

Data: 2026-10-28 · Status: rascunho para aprovação do dono

## Por que

Uma unidade quis vender uma assinatura (provavelmente anual) parcelada no
cartão e não conseguiu: hoje a assinatura no cartão só sai à vista. A
recorrência nativa dos dois gateways (assinatura do Asaas, `preapproval` do
Mercado Pago) cobra o valor do ciclo de uma vez e não aceita parcelamento.

O que o dono quer, nas palavras dele: **"que ela compre como se fosse comprar um
curso"** — o aluno abre a página de pagamento, escolhe em quantas vezes e paga o
valor TOTAL do período no cartão.

## O que muda para o aluno

- Na página de pagamento da assinatura (`/pagar/assinatura/<id>`) e nos
  checkouts da loja, o cartão ganha o seletor de parcelas, o MESMO do checkout
  de curso.
- Parcelado = o valor cheio do período (preço congelado em `priceAtPurchase`)
  dividido em N parcelas no cartão.
- **Renovação (planos recorrentes):** quando o período pago está para acabar, o
  aluno recebe aviso com o link e paga o próximo período do mesmo jeito —
  escolhe as parcelas e paga. NÃO há cobrança automática no cartão nesse modo.
  Se ele não pagar, vale a carência e o cancelamento que já existem.
- **Vitalícia:** uma compra só, parcelável, sem renovação.

## Decisões do dono (2026-10-27/28)

1. Vale para **toda assinatura vendida pela revenda**, nos **dois gateways**.
2. Parcelar é parcelar o **valor total do período** no cartão, escolhido pelo
   aluno na hora de pagar.
3. Mensal, trimestral, semestral e anual **renovam por período**; vitalícia
   **paga uma vez**.
4. **Todas as periodicidades vão até 12x**, inclusive a mensal. A sobreposição
   (o mês seguinte começar a ser parcelado antes de o anterior terminar) foi
   aceita conscientemente.
5. A unidade define **quantas parcelas são sem juros**, como já faz para os
   cursos (`Tenant.interestFreeInstallments`).

## Restrição técnica que define o desenho

- Nenhum dos dois gateways parcela na recorrência nativa.
- O Mercado Pago **não cobra cartão salvo sem o código de segurança** (CVV) —
  confirmado na documentação dele ("Receber pagamentos com cartões salvos": é
  preciso capturar o CVV de novo). Renovar sozinho, parcelado, no MP é
  impossível. No Asaas seria possível (`creditCardToken`), mas aí as duas lojas
  se comportariam diferente.

Por isso **cada período é uma compra parcelada no cartão, paga pelo aluno na
página da loja**, nos dois gateways. A recorrência fica com a plataforma, não
com o gateway.

## Como (decidido nesta conversa — chamadas minhas, sem objeção do dono)

### Reusar o carnê, não criar um modelo novo

O carnê da assinatura (`src/lib/subscriptions/carne*.ts`,
`StudentSubscription.boletoCarne`) já é exatamente "a plataforma abre uma
cobrança por ciclo, o aluno paga na nossa página, o período pago sai das linhas
pagas (`carnePeriodEnd`), a varredura cria a linha de renovação
(`carneRowsToAppend`), encerra o abandonado e cancela as abertas no
cancelamento". O parcelado no cartão é **um terceiro meio desse carnê**, ao
lado de BOLETO e PIX:

- `billingType = "CARD_INSTALLMENT"` (valor novo) com `boletoCarne = true`.
- Cada linha de `SubscriptionPayment` numerada é UM período, com o valor cheio.
- Diferente de boleto/PIX, a linha de cartão **nunca é emitida pelo cron**: não
  há o que emitir sem o cartão do aluno. Ela fica aberta até o aluno pagar na
  página. A cobrança no gateway nasce no pagamento.
- `usesPlatformCycles` passa a reconhecer o cartão parcelado.

### Alcance: só assinatura NOVA e ainda NÃO paga (decisão do dono, 2026-10-28)

O parcelado só é oferecido à assinatura `PENDING` que ainda não tem nada no
gateway (`!hasGatewayCharge(sub) && !sub.boletoCarne`) — o caminho de "cobrança
nova" de `payUnderLock`. Quem já assina (cartão automático, boleto, PIX, Pix
Automático) segue no meio que tem; não há conversão de assinatura existente.
Motivo: cada conversão exigiria desligar a cobrança viva antes de cobrar o
cartão, e falha no meio = cobrança em dobro.

Consequência (chamada minha): o carnê de boleto/PIX do Asaas ainda não pago
continua como hoje — escolher cartão nele vira assinatura do Asaas no cartão à
vista (`convertCarneToCard`), sem seletor de parcelas.

### Quem cai nesse modo: o nº de parcelas decide

Sem botão novo. No seletor de parcelas do cartão da 1ª compra:

- **1x** → comportamento de hoje (assinatura do gateway no cartão, debitada
  sozinha a cada ciclo; na vitalícia, pagamento único).
- **2x a 12x** → carnê de cartão parcelado descrito acima.

### Renovação de uma assinatura parcelada (chamada minha)

A linha de renovação é paga **só no cartão, de 1x a 12x**, sempre como compra
daquele período. **1x aqui NÃO converte** para a recorrência do gateway: a
assinatura continua no modo parcelado e nada é debitado sozinho. Sem PIX/boleto
na renovação — o carnê já trava o meio com que nasceu (`payCarneBoleto`), e
abrir outro meio exigiria emissão sob demanda e troca de `billingType`.

### Quantas parcelas e com que juros: igual ao curso, por gateway

Mesmas funções do checkout de curso, sem regra nova:

- **Mercado Pago:** oferece 1..12; até o nº sem juros da unidade a loja absorve,
  acima o aluno paga o juros do emissor (`buildInstallmentOptions` +
  `payer_costs` do MP). Pagamento transparente com `installments`.
- **Asaas:** o teto é `interestFreeInstallmentsFor(preço, interestFreeInstallments)`
  — no Asaas não há juros para o aluno, toda parcela sai do bolso da unidade,
  então o nº sem juros É o máximo (comportamento atual do curso,
  `chargeCardInstallments`). `POST /installments/` na conta da unidade.
- Piso de R$ 5 por parcela (`MIN_CARD_INSTALLMENT_VALUE`) nos dois.
- A vitrine anuncia o mesmo número que o checkout aceita
  (`interestFreeInstallmentText`) na página e no card do plano — anunciar mais
  do que o checkout aceita é oferta que obriga (CDC art. 30).

### Portas que precisam aceitar

Toda porta em que a loja da unidade cobra assinatura no cartão (lição do
`GUARDIAN_REQUIRED`: gate numa porta só não é gate):

- `src/app/api/loja/checkout/assinatura/pagar/route.ts` → `payStoreSubscription`
  (página `/pagar/assinatura/<id>`, usada pela venda direta e pela renovação);
- o checkout anônimo de assinatura da loja (`/api/loja/checkout/assinatura`);
- `/api/aluno/assinatura` (aluno logado). No MP essa tela já recusa cartão com
  mensagem (o cartão só é tokenizado na página da loja) — continua assim.

A venda direta do /painel não muda: o link já leva à página da loja, onde o
aluno escolhe.

### Webhook: uma compra parcelada não pode valer N períodos

- **Asaas:** um parcelamento vira N cobranças, todas confirmadas no mesmo minuto
  e entregues em paralelo (webhooks das unidades são não sequenciais). Hoje toda
  cobrança com `pmb_sub_<id>` liquida um ciclo e empurra `currentPeriodEnd` —
  12 parcelas dariam 12 períodos. **Só a compra conta como período**; parcelas
  2..N não estendem nada. O mesmo problema já foi resolvido no curso
  (`lib/enrollment/card-installment.ts`, `isFirstCardInstallment`) — usar o
  mesmo critério (`installmentNumber` do Asaas, com fallback no id gravado).
  Ligar a cobrança à linha do carnê pelo id do parcelamento (`payment.installment`)
  ou por referência própria da linha (como o `subbol_` do boleto MP) — escolha do
  builder, desde que nenhuma parcela caia no tratamento genérico de
  `pmb_sub_` como se fosse um ciclo.
- **Mercado Pago:** um pagamento só, com `installments`. Um webhook. Mas o
  `cancelled`/`refunded` dele tem de cair no tratamento certo (ver o cuidado do
  `subbol_` em `carne-schedule.ts`: `cancelled` em `pmb_sub_` é lido como
  estorno).
- **Receita:** o período entra UMA vez pelo valor dele em
  `SUBSCRIPTION_REVENUE_WHERE` / relatórios / extrato do aluno. Nem dobrar (linha
  do ciclo + linhas das parcelas), nem somar só a 1ª parcela.
- **Estorno/chargeback** da compra parcelada revoga como hoje
  (`revokeSubscriptionForRefund`), uma vez — não N vezes.

### Renovação e aviso

- A varredura do carnê (`carne-sweep.ts`, dentro do `sweep-boleto-installments`,
  já agendado) cria a linha do próximo período na janela de 7 dias, como faz com
  boleto/PIX.
- O aluno precisa ser **avisado**: ao contrário do Pix Automático e do boleto,
  ninguém paga por ele. Aviso in-app + e-mail quando a linha de renovação abre,
  com o link `/pagar/assinatura/<id>`, e o mesmo bloco "próximo período vence em
  …" em `/aluno/assinatura` que o carnê de PIX já mostra.
- E-mail: lembrar do incidente de 2026-10-20 e da suspensão da Hostinger por
  rajada — nada de disparo em lote fora do pool/cadência existente.

### Cancelamento

Cancelar a assinatura cancela a linha aberta (sem cobrança no gateway, nada a
desfazer). As parcelas de um período JÁ comprado continuam no cartão do aluno —
é uma compra feita; não há estorno automático.

## Não-objetivos

- Renovação automática no cartão parcelado (impossível no MP; descartada para
  manter os dois gateways iguais).
- Vitrine da PMB (`tenantId` null): o pedido é da revenda. Fica como está.
- Teto de parcelas por periodicidade (o dono quis 12x para todas).
- Mudar o cartão à vista (1x) de hoje.
- Converter assinatura que já existe (paga, ou com cobrança aberta no gateway) para o parcelado.
- Parcelar boleto ou PIX.

## Anti-objetivos (falha mesmo funcionando)

- Aluno ganhar mais de um período por uma compra (N webhooks de parcela).
- Vitrine anunciar "12x" e o checkout recusar.
- Cobrança em dobro: duas compras para o mesmo período (dois cliques, duas abas,
  retomada da página). O lock `SUBSCRIPTION_STORE_PAY:<id>` e a regra de reuso
  da cobrança anterior valem aqui; reuso por idempotência inclui o VALOR.
- Assinatura parcelada sem aviso de renovação: o aluno perde o acesso sem saber
  que tinha algo a pagar.

## Deixado para o builder

- Nome exato do `billingType` e se precisa de coluna nova (ex.: id do
  parcelamento do Asaas na linha do carnê) — migration aditiva e idempotente.
- Mecanismo exato de ligação parcela → linha (id do parcelamento vs. referência
  por linha).
- Texto dos avisos e do seletor.
- Como a tela mostra o período parcelado em `/aluno/assinatura` e
  `/aluno/pagamentos`.

## Validação

Não há venda parcelada no cartão de assinatura em produção. Antes de anunciar às
unidades: uma compra de verdade (ou sandbox) em cada gateway, conferindo um
período só concedido, receita somada uma vez e, no Asaas, as N parcelas sem
estender o período. Testes verificados por mutação no ponto de "parcela 2..N
não estende período" e no teto anunciado = teto aceito.

## Implementado (2026-10-28)

- Núcleo: `src/lib/subscriptions/card-installments.ts` (cobrança nos dois
  gateways + evento de parcela do Asaas); teto em
  `subscriptionCardInstallmentsCap` (`carne-schedule.ts`).
- Portas ligadas: página `/pagar/assinatura/<id>` da loja (`payStoreSubscription`)
  e checkout anônimo da loja (`/api/loja/checkout/assinatura`). A vitrine PMB
  recusa `installments > 1` com 400.
- Aviso de renovação: fase C2 da varredura do carnê, uma vez, no dia em que o
  período entra na janela de 7 dias (marcado pela data, sem coluna nova).
- Página do plano anuncia "ou Nx de R$ X sem juros no cartão".

**Ficou de fora (follow-up):** `/api/aluno/assinatura` (aluno logado
contratando por `/aluno/assinar`) — continua só à vista no cartão; e o card do
plano na lista (`plans-row.tsx`) ainda não mostra a parcela.
