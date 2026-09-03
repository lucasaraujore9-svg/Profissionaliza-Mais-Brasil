import { prisma } from "@/lib/prisma"
import {
  createSubscription as createAsaasSubscription,
  createPayment as createAsaasPayment,
  listPayments as listAsaasPayments,
  findOrCreateAsaasCustomer,
  motherAsaasKey,
} from "@/lib/asaas/client"
import { createPreapproval, createPreference } from "@/lib/mercadopago/client"
import { asaasCycleFor, mpRecurrenceFor } from "./interval"
import { asaasWebhookUrl, mpWebhookUrl, appUrl } from "@/lib/tenant/urls"
import { contextLogger } from "@/lib/logger"
import { assertPmbCharge } from "@/lib/checkout/assert-tenant-gateway"
import type { PlanCheckoutData } from "./plans"

/**
 * Cria a cobranca da assinatura no gateway.
 *
 * A diferenca para o curso `MONTHLY` que ja existia e UMA e e o ponto do
 * produto: aqui NAO se passa `maxPayments` (Asaas) nem `end_date` (MP). Aquele
 * fluxo e um parcelado mensal com fim programado — ao atingir o total a
 * matricula vira COMPLETED e nada recria. A assinatura renova ate alguem
 * cancelar.
 *
 * A PERIODICIDADE vem do plano e decide DOIS caminhos estruturalmente
 * diferentes, nao um parametro a mais:
 *
 *  - **Recorrente** (mensal/trimestral/semestral/anual): assinatura no gateway
 *    (`POST /subscriptions` no Asaas, `preapproval` no MP), com o ciclo
 *    traduzido por `interval.ts`.
 *  - **Vitalicia**: NADA de recorrencia — uma cobranca AVULSA
 *    (`POST /payments` / `preference`). Criar assinatura aqui faria o gateway
 *    cobrar de novo la na frente por um acesso que ja foi vendido para sempre.
 *
 * As duas pontas continuam usando o MESMO `externalReference` `pmb_sub_<id>`:
 * e por ele que o webhook encontra a assinatura no caso vitalicio, onde nao
 * existe `asaasSubscriptionId` para casar.
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

/**
 * `UNDEFINED` e o meio da VENDA DIRETA: o vendedor nao tem o cartao do aluno em
 * maos, entao a cobranca nasce em aberto e o proprio aluno escolhe como pagar
 * na fatura. Os outros tres sao o checkout em que o aluno ja esta na tela.
 */
export type SubscriptionBillingType =
  | "CREDIT_CARD"
  | "PIX"
  | "BOLETO"
  | "UNDEFINED"

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
  /**
   * Link para o aluno AUTORIZAR/pagar fora da nossa tela. É o que a venda
   * direta manda para ele: no Asaas é a própria fatura, no MP é o `init_point`
   * do preapproval (onde ele cadastra o cartão da recorrência).
   */
  initPoint: string | null
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

  const externalReference = `pmb_sub_${input.subscriptionId}`
  // Webhook da conta CERTA: o Asaas roteia por `?tenant=<slug>` e o processador
  // da unidade valida com o token DELA. Apontar para a URL da conta-mãe faria o
  // evento cair no processador errado e a renovação nunca ser reconhecida.
  const notificationUrl = asaasWebhookUrl(account.tenantSlug ?? undefined)
  const cycle = asaasCycleFor(input.plan.interval)

  // ── VITALÍCIA: cobrança AVULSA, nunca assinatura ─────────────────────────
  // Uma assinatura aqui seguiria cobrando o aluno para sempre por um acesso que
  // ele já comprou de uma vez — e o cancelamento (que revoga o curso na
  // fornecedora) seria a única forma de parar a cobrança.
  if (cycle === null) {
    const payment = await createAsaasPayment(
      {
        customer: customer.id,
        billingType: input.billingType,
        value: input.plan.price,
        dueDate: dueDateInDays(isCard ? 0 : 3),
        description: `Acesso vitalício — ${input.plan.name}`,
        externalReference,
        notificationUrl,
        ...(cardPair ?? {}),
      },
      key,
    )

    await prisma.studentSubscription.update({
      where: { id: input.subscriptionId },
      data: {
        // NÃO grava `asaasSubscriptionId`: não existe assinatura no Asaas. É o
        // `externalReference` que o webhook usa para achar esta linha.
        asaasCustomerId: customer.id,
        externalReference,
        billingType: input.billingType,
        gateway: "ASAAS",
      },
    })

    if (isCard) return { invoiceUrl: null, initPoint: null, authorized: true }
    return {
      invoiceUrl: payment.invoiceUrl,
      initPoint: payment.invoiceUrl,
      authorized: false,
    }
  }

  const subscription = await createAsaasSubscription(
    {
      customer: customer.id,
      billingType: input.billingType,
      value: input.plan.price,
      nextDueDate: dueDateInDays(isCard ? 0 : 3),
      cycle,
      description: `Assinatura — ${input.plan.name}`,
      externalReference,
      // SEM maxPayments: a assinatura renova até ser cancelada. É a única
      // diferença estrutural para o curso MONTHLY.
      notificationUrl,
      ...(cardPair ?? {}),
    },
    key,
  )

  await prisma.studentSubscription.update({
    where: { id: input.subscriptionId },
    data: {
      asaasSubscriptionId: subscription.id,
      asaasCustomerId: customer.id,
      externalReference,
      billingType: input.billingType,
      gateway: "ASAAS",
    },
  })

  // No CARTÃO a 1ª parcela já foi capturada na criação da assinatura: devolver
  // a `invoiceUrl` faria a tela pedir que o aluno pagasse de novo uma cobrança
  // que já está no cartão dele. Só PIX e boleto têm fatura a pagar.
  if (isCard) return { invoiceUrl: null, initPoint: null, authorized: true }

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

  return { invoiceUrl, initPoint: invoiceUrl, authorized: false }
}

/**
 * Assinatura no MERCADO PAGO (conta da unidade).
 *
 * DOIS modos, decididos pela presenca do token do cartao:
 *
 *  - **Com `cardToken`** (checkout na vitrine): `status: "authorized"` — fluxo
 *    transparente, sem redirect, o aluno nao sai da loja da unidade.
 *  - **Sem token** (VENDA DIRETA): `status: "pending"` + `init_point`. O
 *    vendedor nao tem o cartao do aluno em maos; exigir o token ali obrigaria a
 *    pedir o numero do cartao por telefone. O aluno autoriza a recorrencia na
 *    pagina do MP e o webhook faz o resto.
 *
 * VITALICIA nao usa preapproval: vira uma PREFERENCIA de pagamento unico, onde
 * o aluno escolhe cartao, PIX ou boleto.
 */
async function createMpSubscriptionForPlan(
  input: CreateSubscriptionInput,
  accessToken: string,
  tenantSlug: string | null,
): Promise<CreateSubscriptionResult> {
  const externalReference = `pmb_sub_${input.subscriptionId}`
  const recurrence = mpRecurrenceFor(input.plan.interval)

  // ── VITALÍCIA: preferência de pagamento único ────────────────────────────
  if (recurrence === null) {
    const preference = await createPreference(
      accessToken,
      {
        items: [
          {
            id: input.plan.id,
            title: `Acesso vitalício — ${input.plan.name}`,
            quantity: 1,
            unit_price: input.plan.price,
            currency_id: "BRL",
          },
        ],
        payer: {
          name: input.payer.nome,
          email: input.payer.email,
          identification: { type: "CPF", number: input.payer.cpf },
        },
        external_reference: externalReference,
        // `?tenant=<slug>` roteia o evento para o processador da unidade, que
        // valida com as credenciais DELA. Sem o slug, uma venda de revenda
        // cairia no processador da PMB e o pagamento nunca seria reconhecido.
        notification_url: mpWebhookUrl(tenantSlug),
      },
      externalReference,
    )

    await prisma.studentSubscription.update({
      where: { id: input.subscriptionId },
      data: {
        // Sem `mpPreapprovalId`: não há recorrência. O webhook acha a linha
        // pelo `external_reference` `pmb_sub_<id>`.
        externalReference,
        billingType: input.billingType,
        gateway: "MP",
      },
    })

    return {
      invoiceUrl: preference.init_point ?? null,
      initPoint: preference.init_point ?? null,
      authorized: false,
    }
  }

  const preapproval = await createPreapproval(
    accessToken,
    {
      reason: `Assinatura — ${input.plan.name}`,
      external_reference: externalReference,
      payer_email: input.payer.email,
      back_url: appUrl(),
      // `?tenant=<slug>` roteia o evento para o processador da unidade, que
      // valida com as credenciais DELA. Estava faltando: sem ele, a renovação
      // de uma assinatura vendida por uma revenda no MP caía no processador da
      // PMB e o ciclo nunca era reconhecido — o aluno pagava e perdia o acesso
      // na virada. Mesma correção que `createPreference`/`createPayment` já
      // tinham (o helper nunca é undefined e usa o host canônico www, evitando
      // o 307 do apex, que o MP não segue).
      notification_url: mpWebhookUrl(tenantSlug),
      ...(input.cardToken ? { card_token_id: input.cardToken } : {}),
      auto_recurring: {
        ...recurrence,
        transaction_amount: input.plan.price,
        currency_id: "BRL",
        // SEM end_date: renova até ser cancelada.
      },
      status: input.cardToken ? "authorized" : "pending",
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

  return {
    invoiceUrl: null,
    initPoint: preapproval.init_point ?? null,
    authorized: preapproval.status === "authorized",
  }
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
  return createMpSubscriptionForPlan(
    input,
    account.mpAccessToken,
    account.tenantSlug ?? null,
  )
}
