import { prisma } from "@/lib/prisma"
import {
  createSubscription as createAsaasSubscription,
  listPayments as listAsaasPayments,
  findOrCreateAsaasCustomer,
  motherAsaasKey,
} from "@/lib/asaas/client"
import { createPreapproval } from "@/lib/mercadopago/client"
import { asaasWebhookUrl, appUrl } from "@/lib/tenant/urls"
import { contextLogger } from "@/lib/logger"
import { assertPmbCharge } from "@/lib/checkout/assert-tenant-gateway"
import type { PlanCheckoutData } from "./plans"

/**
 * Cria a recorrencia da assinatura no gateway.
 *
 * A diferenca para o curso `MONTHLY` que ja existia e UMA e e o ponto do
 * produto: aqui NAO se passa `maxPayments` (Asaas) nem `end_date` (MP). Aquele
 * fluxo e um parcelado mensal com fim programado — ao atingir o total a
 * matricula vira COMPLETED e nada recria. A assinatura renova ate alguem
 * cancelar.
 */

/**
 * Conta que VAI RECEBER. Explicita de proposito: enquanto o Asaas caia num
 * `motherAsaasKey()` fixo aqui dentro, uma assinatura vendida pela vitrine de
 * uma unidade seria cobrada na conta da PMB — o mesmo vazamento de receita do
 * incidente de roteamento por sinal negativo. Agora quem chama informa a conta,
 * e `assertPmbCharge` barra o uso da conta-mae por uma venda de revenda.
 */
export interface SubscriptionGatewayAccount {
  /** Chave Asaas JA DECIFRADA da conta que recebe. Ausente = conta-mae (so PMB). */
  asaasApiKey?: string
  /** Access token MP JA DECIFRADO da conta que recebe. */
  mpAccessToken?: string
  /** Slug da unidade — vai na URL do webhook (o Asaas roteia por `?tenant=`). */
  tenantSlug?: string | null
}

export type SubscriptionBillingType = "CREDIT_CARD" | "PIX" | "BOLETO"

export interface CreateSubscriptionInput {
  subscriptionId: string
  plan: PlanCheckoutData
  tenantId: string | null
  billingType: SubscriptionBillingType
  /** Pagador resolvido (aluno ou responsável) — nunca o aluno direto. */
  payer: {
    nome: string
    cpf: string
    email: string
    phone?: string | null
  }
  /** Token do cartão gerado no browser (MP) — obrigatório no cartão. */
  cardToken?: string
  /** Cartão em claro (Asaas não tokeniza no browser). */
  creditCard?: {
    holderName: string
    number: string
    expiryMonth: string
    expiryYear: string
    ccv: string
  }
  creditCardHolderInfo?: {
    name: string
    email: string
    cpfCnpj: string
    postalCode: string
    addressNumber: string
    addressComplement?: string
    phone: string
  }
  remoteIp?: string
}

export interface CreateSubscriptionResult {
  /** Fatura do 1º ciclo (PIX/boleto) para o aluno pagar. */
  invoiceUrl: string | null
  /** `true` quando o cartão já foi capturado e a assinatura está valendo. */
  authorized: boolean
}

/** YYYY-MM-DD daqui a N dias. */
function dueDateInDays(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Assinatura no ASAAS (conta-mãe — vitrine PMB).
 *
 * Cartão vence hoje (captura na hora); PIX/boleto vencem em 3 dias, como no
 * checkout de curso.
 */
async function createAsaasSubscriptionForPlan(
  input: CreateSubscriptionInput,
  account: SubscriptionGatewayAccount,
): Promise<CreateSubscriptionResult> {
  // Sem chave da unidade só resta a conta-mãe — e ela só pode cobrar assinatura
  // da vitrine PMB. `assertPmbCharge` lança em vez de cobrar na conta errada.
  const key = account.asaasApiKey ?? motherAsaasKey()
  if (!account.asaasApiKey) {
    assertPmbCharge({
      enrollmentTenantId: input.tenantId,
      studentTenantSlug: account.tenantSlug ?? null,
      context: "subscription.checkout.asaas",
    })
  }

  const { customer } = await findOrCreateAsaasCustomer(
    {
      name: input.payer.nome,
      cpfCnpj: input.payer.cpf,
      email: input.payer.email,
      mobilePhone: input.payer.phone ?? undefined,
    },
    key,
  )

  const isCard = input.billingType === "CREDIT_CARD"
  const cardPair =
    isCard && input.creditCard && input.creditCardHolderInfo
      ? {
          creditCard: input.creditCard,
          creditCardHolderInfo: input.creditCardHolderInfo,
          remoteIp: input.remoteIp,
        }
      : null

  const subscription = await createAsaasSubscription(
    {
      customer: customer.id,
      billingType: input.billingType,
      value: input.plan.price,
      nextDueDate: dueDateInDays(isCard ? 0 : 3),
      cycle: "MONTHLY",
      description: `Assinatura — ${input.plan.name}`,
      externalReference: `pmb_sub_${input.subscriptionId}`,
      // SEM maxPayments: a assinatura renova até ser cancelada. É a única
      // diferença estrutural para o curso MONTHLY.
      // Webhook da conta CERTA: o Asaas roteia por `?tenant=<slug>` e o
      // processador da unidade valida com o token DELA. Apontar para a URL da
      // conta-mãe faria o evento cair no processador errado e a renovação
      // nunca ser reconhecida.
      notificationUrl: asaasWebhookUrl(account.tenantSlug ?? undefined),
      ...(cardPair ?? {}),
    },
    key,
  )

  await prisma.studentSubscription.update({
    where: { id: input.subscriptionId },
    data: {
      asaasSubscriptionId: subscription.id,
      asaasCustomerId: customer.id,
      externalReference: `pmb_sub_${input.subscriptionId}`,
      billingType: input.billingType,
      gateway: "ASAAS",
    },
  })

  // No CARTÃO a 1ª parcela já foi capturada na criação da assinatura: devolver
  // a `invoiceUrl` faria a tela pedir que o aluno pagasse de novo uma cobrança
  // que já está no cartão dele. Só PIX e boleto têm fatura a pagar.
  if (isCard) return { invoiceUrl: null, authorized: true }

  // O Asaas gera as cobranças de forma assíncrona; buscamos a 1ª fatura em até
  // 3 tentativas (mesmo padrão de issue-pmb-asaas-charge).
  let invoiceUrl: string | null = null
  for (let i = 0; i < 3; i++) {
    const list = await listAsaasPayments({
      subscription: subscription.id,
      limit: 1,
      offset: 0,
    }).catch(() => null)
    const first = list?.data?.[0]
    if (first) {
      invoiceUrl = first.invoiceUrl
      break
    }
    await new Promise((r) => setTimeout(r, 500))
  }

  return { invoiceUrl, authorized: false }
}

/**
 * Assinatura no MERCADO PAGO (conta da unidade).
 *
 * `status: "authorized"` exige `card_token_id`: é o fluxo transparente, sem
 * redirect. Sem token o MP devolveria um `init_point` — que este checkout não
 * usa, para o aluno não sair da loja da unidade.
 */
async function createMpSubscriptionForPlan(
  input: CreateSubscriptionInput,
  accessToken: string,
): Promise<CreateSubscriptionResult> {
  if (!input.cardToken) {
    throw new Error("assinatura via MP exige card_token_id")
  }

  const externalReference = `pmb_sub_${input.subscriptionId}`
  const preapproval = await createPreapproval(
    accessToken,
    {
      reason: `Assinatura — ${input.plan.name}`,
      external_reference: externalReference,
      payer_email: input.payer.email,
      back_url: appUrl(),
      card_token_id: input.cardToken,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: input.plan.price,
        currency_id: "BRL",
        // SEM end_date: renova até ser cancelada.
      },
      status: "authorized",
    },
    externalReference,
  )

  await prisma.studentSubscription.update({
    where: { id: input.subscriptionId },
    data: {
      mpPreapprovalId: preapproval.id,
      externalReference,
      billingType: "CREDIT_CARD",
      gateway: "MP",
    },
  })

  return { invoiceUrl: null, authorized: preapproval.status === "authorized" }
}

export async function createSubscriptionAtGateway(
  input: CreateSubscriptionInput,
  gateway: "MP" | "ASAAS",
  account: SubscriptionGatewayAccount = {},
): Promise<CreateSubscriptionResult> {
  contextLogger().info(
    {
      event: "subscription.checkout.start",
      subscriptionId: input.subscriptionId,
      tenantId: input.tenantId,
      gateway,
      billingType: input.billingType,
      // Qual CONTA recebe. É o campo que denuncia um vazamento de receita no log
      // antes de alguém notar pelo extrato.
      account: account.asaasApiKey || account.mpAccessToken ? "tenant" : "pmb",
    },
    "criando assinatura no gateway",
  )

  if (gateway === "ASAAS") return createAsaasSubscriptionForPlan(input, account)

  if (!account.mpAccessToken) throw new Error("token do Mercado Pago ausente")
  // Venda de revenda pelo MP: o token JÁ é o da unidade (quem chama resolveu).
  return createMpSubscriptionForPlan(input, account.mpAccessToken)
}
