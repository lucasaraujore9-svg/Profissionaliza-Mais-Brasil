import type { Prisma } from "@prisma/client"

/**
 * Ciclo de assinatura que conta como RECEITA da loja.
 *
 * O pagamento de assinatura mora em `subscription_payments`, nao em `payments`.
 * Enquanto o financeiro e o dashboard do painel so somavam `Payment`, a
 * assinatura paga entrava no Asaas e nao aparecia em tela nenhuma — a unidade
 * lia isso como "o sistema nao deu baixa".
 *
 * `paidAt` e o que prova o pagamento (o status e o ultimo recado do gateway e
 * nao volta atras em todo caminho). Estorno/chargeback grava
 * `SUBSCRIPTION_REFUNDED_STATUS` na linha (`revokeSubscriptionForRefund`), e e
 * so isso que tira da receita um ciclo que chegou a ser pago.
 */
export const SUBSCRIPTION_REFUNDED_STATUS = "REFUNDED"

export const SUBSCRIPTION_REVENUE_WHERE = {
  paidAt: { not: null },
  status: { not: SUBSCRIPTION_REFUNDED_STATUS },
} satisfies Prisma.SubscriptionPaymentWhereInput
