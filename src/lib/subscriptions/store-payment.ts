import { prisma } from "@/lib/prisma"
import { contextLogger } from "@/lib/logger"
import { PAYER_SELECT, resolvePayer } from "@/lib/checkout/payer"
import { decryptTenantAsaasKey } from "@/lib/asaas/client"
import { decryptTenantMpToken } from "@/lib/mercadopago/client"
import { advisoryLockKeyFrom, withAdvisoryLock } from "@/lib/enrollment/fulfill"
import { tenantCheckoutMode } from "@/lib/tenant/checkout-mode"
import { createSubscriptionAtGateway } from "./checkout"
import { getPlanForCheckout } from "./plans"
import { isRecurringInterval } from "./interval"
import type { StoreSubscriptionPaymentInput } from "./checkout-schema"

/**
 * PAGAMENTO, na loja da unidade, de uma assinatura vendida pela venda direta
 * do /painel.
 *
 * A venda direta só cria a linha PENDING e manda o aluno para
 * `/pagar/assinatura/<id>`; é aqui que a cobrança nasce, na conta DA UNIDADE,
 * com o meio que o aluno escolheu na tela. Mesmo desenho do `/pagar/<id>` da
 * venda de curso, onde a cobrança nasce no `/process`.
 *
 * O que vem da LINHA e nunca do corpo:
 *  - preço (`priceAtPurchase`, com o desconto do vendedor dentro);
 *  - periodicidade (`interval`, congelada na venda);
 *  - pagador (o aluno da venda, ou o responsável financeiro dele).
 */

export interface StorePaymentTenant {
  id: string
  slug: string
  salesGateway: string | null
  asaasApiKey: string | null
  asaasWebhookToken: string | null
  mpAccessToken: string | null
  mpPublicKey: string | null
}

export type StorePaymentResult =
  | { ok: true; invoiceUrl: string | null; authorized: boolean }
  | { ok: false; status: number; error: string; code: string }

/** Assinatura que ainda não tem NADA no gateway — só essa pode ser paga aqui. */
export function hasGatewayCharge(sub: {
  mpPreapprovalId: string | null
  asaasSubscriptionId: string | null
  externalReference: string | null
}): boolean {
  return Boolean(
    sub.mpPreapprovalId || sub.asaasSubscriptionId || sub.externalReference,
  )
}

const PAYABLE_SELECT = {
  id: true,
  status: true,
  planId: true,
  priceAtPurchase: true,
  interval: true,
  mpPreapprovalId: true,
  asaasSubscriptionId: true,
  externalReference: true,
  student: { select: PAYER_SELECT },
} as const

function fail(status: number, code: string, error: string): StorePaymentResult {
  return { ok: false, status, code, error }
}

export async function payStoreSubscription(
  tenant: StorePaymentTenant,
  data: StoreSubscriptionPaymentInput,
  remoteIp?: string,
): Promise<StorePaymentResult> {
  // Gateway ATIVO da unidade agora, pela mesma fonte da vitrine. NONE nunca cai
  // no outro gateway nem na conta-mãe (REGRA DE OURO).
  const gateway = tenantCheckoutMode({
    salesGateway: tenant.salesGateway,
    asaasConnected: Boolean(tenant.asaasApiKey && tenant.asaasWebhookToken),
    mpAccessToken: tenant.mpAccessToken,
    mpPublicKey: tenant.mpPublicKey,
  })
  if (gateway === "NONE") {
    return fail(
      400,
      "GATEWAY_NOT_READY",
      "Esta loja ainda não está pronta para receber pagamentos",
    )
  }

  // `tenantId` no where: o id vem da URL, e uma loja nunca cobra a assinatura
  // vendida por outra.
  const sub = await prisma.studentSubscription.findFirst({
    where: { id: data.subscriptionId, tenantId: tenant.id },
    select: PAYABLE_SELECT,
  })
  if (!sub) {
    return fail(404, "SUBSCRIPTION_NOT_FOUND", "Cobrança não encontrada")
  }
  if (sub.status !== "PENDING") {
    return sub.status === "ACTIVE" || sub.status === "PAST_DUE"
      ? fail(409, "SUBSCRIPTION_ALREADY_PAID", "Esta assinatura já está ativa.")
      : fail(409, "SUBSCRIPTION_NOT_PENDING", "Esta cobrança não está mais ativa.")
  }
  if (hasGatewayCharge(sub)) {
    // Criar outra cobrança por cima geraria DUAS recorrências para a mesma
    // pessoa se ela pagasse as duas.
    return fail(
      409,
      "PAYMENT_ALREADY_STARTED",
      "O pagamento desta assinatura já foi iniciado. Conclua pela fatura aberta ou fale com a loja.",
    )
  }

  // O mesmo gate da vitrine na hora de COBRAR: módulo desligado, plano oculto
  // ou sem cursos fecham a venda — a assinatura viva nunca passa por aqui.
  const plan = await getPlanForCheckout(tenant.id, sub.planId)
  if (!plan) {
    return fail(
      409,
      "PLAN_UNAVAILABLE",
      "Este plano não está mais disponível nesta loja. Fale com a loja.",
    )
  }

  const recurring = isRecurringInterval(sub.interval)
  // A recorrência do MP (preapproval) exige cartão tokenizado. Uma compra
  // vitalícia no MP é pagamento comum e aceita os três meios.
  if (gateway === "MP" && recurring && data.paymentMethod !== "CREDIT_CARD") {
    return fail(
      400,
      "METHOD_NOT_SUPPORTED",
      "Esta loja aceita assinatura recorrente apenas no cartão de crédito",
    )
  }
  if (data.paymentMethod === "CREDIT_CARD") {
    const cardReady =
      gateway === "MP"
        ? Boolean(data.cardToken)
        : Boolean(data.creditCard && data.creditCardHolder)
    if (!cardReady) {
      return fail(400, "CARD_REQUIRED", "Dados do cartão obrigatórios")
    }
  }

  const payer = resolvePayer(sub.student)
  const payerCpf = payer.cpf
  const payerEmail = payer.email
  if (!payerCpf || !payerEmail) {
    return fail(
      400,
      "PAYER_INCOMPLETE",
      "Cadastro incompleto para gerar a cobrança. Fale com a loja.",
    )
  }

  let result: StorePaymentResult = fail(
    409,
    "PAYMENT_IN_PROGRESS",
    "Já existe um pagamento em processamento para esta assinatura. Aguarde alguns segundos.",
  )

  // Dois cliques (ou duas abas) não podem criar duas cobranças: a checagem
  // acima é refeita DENTRO do lock, contra a linha atual.
  await withAdvisoryLock(
    advisoryLockKeyFrom(`SUBSCRIPTION_STORE_PAY:${sub.id}`),
    async () => {
      const current = await prisma.studentSubscription.findUnique({
        where: { id: sub.id },
        select: {
          status: true,
          mpPreapprovalId: true,
          asaasSubscriptionId: true,
          externalReference: true,
        },
      })
      if (!current || current.status !== "PENDING" || hasGatewayCharge(current)) {
        result = fail(
          409,
          "PAYMENT_ALREADY_STARTED",
          "O pagamento desta assinatura já foi iniciado. Conclua pela fatura aberta ou fale com a loja.",
        )
        return
      }

      try {
        const charged = await createSubscriptionAtGateway(
          {
            subscriptionId: sub.id,
            // Preço e periodicidade CONGELADOS na venda — nunca os de hoje do
            // catálogo, que podem ter mudado desde que o link foi enviado.
            plan: {
              ...plan,
              price: Number(sub.priceAtPurchase),
              interval: sub.interval,
            },
            tenantId: tenant.id,
            billingType: data.paymentMethod,
            payer: {
              nome: payer.nome,
              cpf: payerCpf,
              email: payerEmail,
              phone: payer.fone,
            },
            cardToken: gateway === "MP" ? data.cardToken : undefined,
            creditCard: gateway === "ASAAS" ? data.creditCard : undefined,
            creditCardHolderInfo:
              gateway === "ASAAS" && data.creditCard && data.creditCardHolder
                ? {
                    name: payer.nome,
                    email: payerEmail,
                    cpfCnpj: payerCpf,
                    postalCode: data.creditCardHolder.postalCode,
                    addressNumber: data.creditCardHolder.addressNumber,
                    addressComplement: data.creditCardHolder.addressComplement,
                    phone: payer.fone ?? "",
                  }
                : undefined,
            remoteIp,
          },
          gateway,
          // A CONTA da unidade — nunca a conta-mãe.
          {
            asaasApiKey: tenant.asaasApiKey
              ? decryptTenantAsaasKey(tenant.asaasApiKey)
              : undefined,
            mpAccessToken: tenant.mpAccessToken
              ? decryptTenantMpToken(tenant.mpAccessToken)
              : undefined,
            tenantSlug: tenant.slug,
          },
        )
        result = {
          ok: true,
          invoiceUrl: charged.invoiceUrl,
          authorized: charged.authorized,
        }
      } catch (err) {
        // Nada a desfazer: a linha só ganha ids de gateway quando a cobrança é
        // criada, então um cartão recusado deixa o link pronto para nova
        // tentativa.
        contextLogger().error(
          {
            err,
            event: "loja.assinatura.store_payment_failed",
            tenantId: tenant.id,
            subscriptionId: sub.id,
            gateway,
          },
          "falha ao cobrar assinatura vendida pela loja",
        )
        result = fail(
          502,
          "GATEWAY_FAILED",
          data.paymentMethod === "CREDIT_CARD"
            ? "Não foi possível aprovar o cartão. Confira os dados ou tente outro cartão."
            : "Não foi possível gerar a cobrança. Tente novamente.",
        )
      }
    },
  )

  return result
}
