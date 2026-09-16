import { prisma } from "@/lib/prisma"
import {
  createSubscription as createAsaasSubscription,
  createPayment as createAsaasPayment,
  listPayments as listAsaasPayments,
  findOrCreateAsaasCustomer,
  motherAsaasKey,
} from "@/lib/asaas/client"
import { createPayment, createPreapproval } from "@/lib/mercadopago/client"
import {
  asaasBoletoInstrument,
  asaasPixInstrument,
  type BoletoInstrument,
  type PixInstrument,
} from "@/lib/asaas/payment-instrument"
import type { AsaasPayment } from "@/lib/asaas/types"
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
 *    (`POST /payments` nos dois gateways). Criar assinatura aqui faria o
 *    gateway cobrar de novo la na frente por um acesso que ja foi vendido para
 *    sempre.
 *
 * O aluno paga SEMPRE dentro da nossa pagina: PIX sai como QR, boleto como
 * linha digitavel + PDF, cartao e capturado na hora. Nenhum caminho devolve a
 * fatura do Asaas nem uma pagina do Mercado Pago.
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
 * O meio que o aluno escolheu NA TELA. Nao existe mais cobranca "em aberto"
 * (`UNDEFINED`): a venda direta so cria a linha e manda o aluno para a pagina
 * de pagamento da plataforma, onde ele escolhe o meio.
 */
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
  /**
   * Bandeira do cartão (`visa`, `master`...) resolvida pelo SDK do MP a partir
   * do BIN. O `/v1/payments` do MP exige no cartão — só a vitalícia usa; a
   * recorrência (preapproval) aceita só o token.
   */
  mpPaymentMethodId?: string
  mpIssuerId?: string
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
  /** `true` quando o cartão já foi capturado e a assinatura está valendo. */
  authorized: boolean
  /** PIX do 1º ciclo, para pagar na própria tela. */
  pix?: PixInstrument
  /** Boleto do 1º ciclo (linha digitável + PDF), para pagar na própria tela. */
  boleto?: BoletoInstrument
  /** Cartão recusado pelo gateway: mensagem para o aluno. */
  rejectedMessage?: string
}

/**
 * PIX/boleto de uma cobrança do Asaas para a tela. Sem instrumento (Asaas ainda
 * gerando), devolve só `authorized: false` e a tela manda o aluno para a página
 * de pagamento da assinatura — nunca para a fatura.
 */
export async function asaasInstrumentFor(
  payment: Pick<AsaasPayment, "id" | "bankSlipUrl">,
  billingType: SubscriptionBillingType,
  apiKey: string,
): Promise<Pick<CreateSubscriptionResult, "pix" | "boleto">> {
  if (billingType === "PIX") {
    const pix = await asaasPixInstrument(payment.id, apiKey)
    return pix ? { pix } : {}
  }
  if (billingType === "BOLETO") {
    const boleto = await asaasBoletoInstrument(payment, apiKey)
    return boleto ? { boleto } : {}
  }
  return {}
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

    if (isCard) return { authorized: true }
    return {
      authorized: false,
      ...(await asaasInstrumentFor(payment, input.billingType, key)),
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

  // No CARTÃO a 1ª parcela já foi capturada na criação da assinatura: mostrar
  // PIX/boleto faria a tela pedir que o aluno pagasse de novo uma cobrança que
  // já está no cartão dele.
  if (isCard) return { authorized: true }

  // O Asaas gera as cobranças de forma assíncrona; buscamos a 1ª fatura em até
  // 3 tentativas (mesmo padrão de issue-pmb-asaas-charge).
  //
  // Com a MESMA chave que criou a assinatura. Sem ela a listagem ia para a
  // conta-mãe, que não conhece a assinatura da unidade: a lista voltava vazia e
  // o aluno de uma revenda no Asaas que escolhia PIX/boleto ficava sem fatura.
  for (let i = 0; i < 3; i++) {
    const list = await listAsaasPayments(
      {
        subscription: subscription.id,
        limit: 1,
        offset: 0,
      },
      key,
    ).catch(() => null)
    const first = list?.data?.[0]
    if (first) {
      return {
        authorized: false,
        ...(await asaasInstrumentFor(first, input.billingType, key)),
      }
    }
    await new Promise((r) => setTimeout(r, 500))
  }

  return { authorized: false }
}

/**
 * Assinatura no MERCADO PAGO (conta da unidade).
 *
 *  - **Recorrente**: preapproval `authorized` com o `card_token_id` gerado no
 *    browser. Sem token não há recorrência no MP — e sem página do MP: a venda
 *    direta manda o aluno para a página de pagamento da loja, que tokeniza.
 *  - **Vitalícia**: pagamento único transparente (`POST /v1/payments`), com
 *    PIX (QR na tela) ou cartão tokenizado. Antes era uma `preference` e o
 *    aluno pagava na página do Mercado Pago.
 */
async function createMpSubscriptionForPlan(
  input: CreateSubscriptionInput,
  accessToken: string,
  tenantSlug: string | null,
): Promise<CreateSubscriptionResult> {
  const externalReference = `pmb_sub_${input.subscriptionId}`
  const recurrence = mpRecurrenceFor(input.plan.interval)

  // ── VITALÍCIA: pagamento único transparente ──────────────────────────────
  if (recurrence === null) {
    const isCard = input.billingType === "CREDIT_CARD"
    if (input.billingType === "BOLETO") {
      throw new SubscriptionCheckoutInputError(
        "Esta loja aceita o acesso vitalício no PIX ou no cartão de crédito.",
      )
    }
    if (isCard && (!input.cardToken || !input.mpPaymentMethodId)) {
      throw new SubscriptionCheckoutInputError("Dados do cartão obrigatórios")
    }

    const payment = await createPayment(
      accessToken,
      {
        transaction_amount: input.plan.price,
        description: `Acesso vitalício — ${input.plan.name}`,
        payment_method_id: isCard ? input.mpPaymentMethodId! : "pix",
        external_reference: externalReference,
        // `?tenant=<slug>` roteia o evento para o processador da unidade, que
        // valida com as credenciais DELA. Sem o slug, uma venda de revenda
        // cairia no processador da PMB e o pagamento nunca seria reconhecido.
        notification_url: mpWebhookUrl(tenantSlug),
        payer: {
          email: input.payer.email,
          first_name: input.payer.nome,
          identification: { type: "CPF", number: input.payer.cpf },
        },
        ...(isCard
          ? {
              token: input.cardToken,
              installments: 1,
              ...(input.mpIssuerId ? { issuer_id: input.mpIssuerId } : {}),
            }
          : {}),
      },
      // Cartão: o token é único por envio (permite tentar outro cartão após
      // recusa). PIX: a mesma assinatura devolve o MESMO pagamento a cada
      // volta à página, em vez de abrir outro.
      isCard ? input.cardToken! : `${externalReference}:pix`,
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

    if (payment.status === "approved" || payment.status === "authorized") {
      return { authorized: true }
    }
    if (payment.status === "rejected") {
      return {
        authorized: false,
        rejectedMessage: "Pagamento recusado. Tente outro cartão ou o PIX.",
      }
    }
    const qr = payment.point_of_interaction?.transaction_data
    if (qr?.qr_code) {
      return {
        authorized: false,
        pix: { qrCode: qr.qr_code, qrCodeBase64: qr.qr_code_base64 ?? "" },
      }
    }
    // Cartão em análise: sem dado na tela; o webhook conclui.
    return { authorized: false }
  }

  if (!input.cardToken) {
    // A recorrência do MP sem token só existiria como página do Mercado Pago
    // (`init_point`), e o aluno de uma loja paga sempre na página da loja. O
    // boleto nem chega aqui: é a assinatura no boleto (`carne.ts`).
    throw new SubscriptionCheckoutInputError(
      "Esta loja aceita assinatura no cartão de crédito ou no boleto",
    )
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
      card_token_id: input.cardToken,
      auto_recurring: {
        ...recurrence,
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

  return { authorized: preapproval.status === "authorized" }
}

/**
 * Pedido que o gateway nunca aceitaria (meio não oferecido, cartão sem token).
 * As rotas devolvem 400 com a mensagem — não é falha do gateway.
 */
export class SubscriptionCheckoutInputError extends Error {}

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
