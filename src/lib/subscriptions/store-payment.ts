import { prisma } from "@/lib/prisma"
import { contextLogger } from "@/lib/logger"
import { PAYER_SELECT, resolvePayer } from "@/lib/checkout/payer"
import {
  AsaasApiError,
  decryptTenantAsaasKey,
  getPayment,
  listPayments,
  motherAsaasKey,
  payWithCreditCard,
} from "@/lib/asaas/client"
import type { AsaasPayment } from "@/lib/asaas/types"
import { decryptTenantMpToken } from "@/lib/mercadopago/client"
import { advisoryLockKeyFrom, withAdvisoryLock } from "@/lib/enrollment/fulfill"
import { tenantCheckoutMode } from "@/lib/tenant/checkout-mode"
import type {
  BoletoInstrument,
  PixInstrument,
} from "@/lib/asaas/payment-instrument"
import {
  asaasInstrumentFor,
  createSubscriptionAtGateway,
  SubscriptionCheckoutInputError,
  type SubscriptionGatewayAccount,
} from "./checkout"
import { getPlanForCheckout } from "./plans"
import { isRecurringInterval } from "./interval"
import { settleSubscriptionCycle } from "./renew"
import type { StoreSubscriptionPaymentInput } from "./checkout-schema"

/**
 * PAGAMENTO de uma assinatura na página da PLATAFORMA (`/pagar/assinatura/<id>`)
 * — na loja da unidade ou no domínio da PMB. É o único lugar onde o aluno paga
 * uma assinatura que já existe: a venda direta, o "Pagar" da área do aluno e a
 * fatura de renovação apontam para cá, nunca para a página do gateway.
 *
 * Três situações, decididas pela linha e pelo gateway:
 *  - **sem cobrança ainda** (venda direta): a cobrança nasce aqui, na conta da
 *    loja, com o meio que o aluno escolheu;
 *  - **fatura aberta no Asaas** (1º ciclo já emitido, renovação, vitalícia):
 *    paga ESSA cobrança — PIX/boleto na tela, cartão via `payWithCreditCard` —
 *    sem criar outra por cima;
 *  - **vitalícia pendente no MP** (PIX que o aluno não pagou): reabre o MESMO
 *    pagamento (idempotência por método).
 *
 * O que vem da LINHA e nunca do corpo: preço (`priceAtPurchase`), periodicidade
 * (`interval`) e pagador (o aluno da venda, ou o responsável financeiro dele).
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
  | {
      ok: true
      authorized: boolean
      pix?: PixInstrument
      boleto?: BoletoInstrument
    }
  | { ok: false; status: number; error: string; code: string }

/** Assinatura que já tem algo no gateway (cobrança ou recorrência). */
export function hasGatewayCharge(sub: {
  mpPreapprovalId: string | null
  asaasSubscriptionId: string | null
  externalReference: string | null
}): boolean {
  return Boolean(
    sub.mpPreapprovalId || sub.asaasSubscriptionId || sub.externalReference,
  )
}

const OPEN_ASAAS_STATUSES = new Set(["PENDING", "OVERDUE"])
const CONFIRMED_ASAAS_STATUSES = new Set(["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"])

const PAYABLE_SELECT = {
  id: true,
  tenantId: true,
  status: true,
  planId: true,
  priceAtPurchase: true,
  interval: true,
  gateway: true,
  mpPreapprovalId: true,
  asaasSubscriptionId: true,
  externalReference: true,
  student: { select: PAYER_SELECT },
} as const

type PayableSubscription = {
  id: string
  tenantId: string | null
  status: string
  planId: string
  interval: Parameters<typeof isRecurringInterval>[0]
  gateway: string
  mpPreapprovalId: string | null
  asaasSubscriptionId: string | null
  externalReference: string | null
}

function fail(status: number, code: string, error: string): StorePaymentResult {
  return { ok: false, status, code, error }
}

/** Conta que recebe: a da unidade, ou a conta-mãe na vitrine PMB. */
interface ResolvedAccount {
  gateway: "MP" | "ASAAS"
  /** Chave para OPERAR cobranças existentes (sempre presente no Asaas). */
  asaasApiKey?: string
  /** Repassada a `createSubscriptionAtGateway`; `{}` na PMB libera o assert. */
  account: SubscriptionGatewayAccount
}

function resolveAccount(tenant: StorePaymentTenant | null): ResolvedAccount | null {
  if (!tenant) {
    // A vitrine PMB assina SEMPRE pelo Asaas da conta-mãe (ver
    // /api/checkout/assinatura): a recorrência do MP não emite PIX/boleto.
    try {
      return { gateway: "ASAAS", asaasApiKey: motherAsaasKey(), account: {} }
    } catch {
      return null
    }
  }
  // Gateway ATIVO da unidade agora, pela mesma fonte da vitrine. NONE nunca cai
  // no outro gateway nem na conta-mãe (REGRA DE OURO).
  const gateway = tenantCheckoutMode({
    salesGateway: tenant.salesGateway,
    asaasConnected: Boolean(tenant.asaasApiKey && tenant.asaasWebhookToken),
    mpAccessToken: tenant.mpAccessToken,
    mpPublicKey: tenant.mpPublicKey,
  })
  if (gateway === "NONE") return null
  const asaasApiKey = tenant.asaasApiKey
    ? decryptTenantAsaasKey(tenant.asaasApiKey)
    : undefined
  return {
    gateway,
    asaasApiKey,
    // A CONTA da unidade — nunca a conta-mãe.
    account: {
      asaasApiKey,
      mpAccessToken: tenant.mpAccessToken
        ? decryptTenantMpToken(tenant.mpAccessToken)
        : undefined,
      tenantSlug: tenant.slug,
    },
  }
}

/**
 * A cobrança do Asaas em aberto desta assinatura, lida AO VIVO. Primeiro os
 * ciclos que o webhook registrou; sem registro (webhook atrasado), pergunta ao
 * Asaas pela recorrência ou, na vitalícia, pela referência da cobrança avulsa.
 */
async function findOpenAsaasCharge(
  sub: PayableSubscription,
  apiKey: string,
): Promise<AsaasPayment | null> {
  const isOpen = (p: AsaasPayment | null): p is AsaasPayment =>
    Boolean(p && !p.deleted && OPEN_ASAAS_STATUSES.has(p.status))

  const rows = await prisma.subscriptionPayment.findMany({
    where: {
      subscriptionId: sub.id,
      paidAt: null,
      asaasPaymentId: { not: null },
      status: { in: [...OPEN_ASAAS_STATUSES] },
    },
    orderBy: { dueDate: "asc" },
    select: { asaasPaymentId: true },
  })
  for (const row of rows) {
    const live = await getPayment(row.asaasPaymentId!, apiKey).catch(() => null)
    if (isOpen(live)) return live
  }

  const filter = sub.asaasSubscriptionId
    ? { subscription: sub.asaasSubscriptionId }
    : sub.externalReference
      ? { externalReference: sub.externalReference }
      : null
  if (!filter) return null
  const list = await listPayments({ ...filter, limit: 20, offset: 0 }, apiKey).catch(
    () => null,
  )
  return (
    (list?.data ?? [])
      .filter(isOpen)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null
  )
}

export async function payStoreSubscription(
  /** Loja dona da assinatura; `null` = vitrine da PMB. */
  tenant: StorePaymentTenant | null,
  data: StoreSubscriptionPaymentInput,
  remoteIp?: string,
): Promise<StorePaymentResult> {
  const resolved = resolveAccount(tenant)
  if (!resolved) {
    return fail(
      400,
      "GATEWAY_NOT_READY",
      "Esta loja ainda não está pronta para receber pagamentos",
    )
  }

  // `tenantId` no where: o id vem da URL, e uma loja nunca cobra a assinatura
  // vendida por outra (nem a PMB a de uma unidade).
  const sub = await prisma.studentSubscription.findFirst({
    where: { id: data.subscriptionId, tenantId: tenant?.id ?? null },
    select: PAYABLE_SELECT,
  })
  if (!sub) {
    return fail(404, "SUBSCRIPTION_NOT_FOUND", "Cobrança não encontrada")
  }
  if (sub.status === "CANCELLED" || sub.status === "EXPIRED") {
    return fail(409, "SUBSCRIPTION_NOT_PENDING", "Esta cobrança não está mais ativa.")
  }

  const payer = resolvePayer(sub.student)
  if (!payer.cpf || !payer.email) {
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

  // Dois cliques (ou duas abas) não podem criar duas cobranças: tudo que olha a
  // linha e decide é refeito DENTRO do lock, contra a linha atual.
  await withAdvisoryLock(
    advisoryLockKeyFrom(`SUBSCRIPTION_STORE_PAY:${sub.id}`),
    async () => {
      const current = await prisma.studentSubscription.findUnique({
        where: { id: sub.id },
        select: PAYABLE_SELECT,
      })
      if (!current) {
        result = fail(404, "SUBSCRIPTION_NOT_FOUND", "Cobrança não encontrada")
        return
      }
      try {
        result = await payUnderLock(current, data, resolved, {
          nome: payer.nome,
          cpf: payer.cpf!,
          email: payer.email!,
          phone: payer.fone,
        }, remoteIp)
      } catch (err) {
        if (err instanceof SubscriptionCheckoutInputError) {
          result = fail(400, "METHOD_NOT_SUPPORTED", err.message)
          return
        }
        contextLogger().error(
          {
            err,
            event: "loja.assinatura.store_payment_failed",
            tenantId: tenant?.id ?? null,
            subscriptionId: sub.id,
            gateway: resolved.gateway,
          },
          "falha ao cobrar assinatura na página de pagamento",
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

interface PayerData {
  nome: string
  cpf: string
  email: string
  phone: string | null
}

async function payUnderLock(
  sub: PayableSubscription & { priceAtPurchase: unknown },
  data: StoreSubscriptionPaymentInput,
  resolved: ResolvedAccount,
  payer: PayerData,
  remoteIp: string | undefined,
): Promise<StorePaymentResult> {
  // ── Já existe cobrança no gateway ────────────────────────────────────────
  if (hasGatewayCharge(sub)) {
    if (sub.gateway === "ASAAS" || sub.asaasSubscriptionId) {
      return payOpenAsaasCharge(sub, data, resolved, payer, remoteIp)
    }
    // Só a VITALÍCIA do MP ainda não paga é reaberta (o PIX volta idêntico pela
    // idempotência). Recorrência do MP já autorizada no cartão: o MP cobra
    // sozinho, e uma segunda preapproval cobraria em dobro.
    const mpLifetimePending =
      !sub.mpPreapprovalId &&
      !isRecurringInterval(sub.interval) &&
      sub.status === "PENDING"
    if (!mpLifetimePending) {
      return sub.status === "PENDING"
        ? fail(
            409,
            "PAYMENT_ALREADY_STARTED",
            "O pagamento desta assinatura já está sendo processado no cartão. Aguarde a confirmação.",
          )
        : fail(409, "SUBSCRIPTION_ALREADY_PAID", "Esta assinatura já está ativa.")
    }
  } else if (sub.status !== "PENDING") {
    return fail(409, "SUBSCRIPTION_ALREADY_PAID", "Esta assinatura já está ativa.")
  }

  // ── Cobrança nova (ou reabertura idempotente da vitalícia do MP) ─────────
  // O mesmo gate da vitrine na hora de COBRAR: módulo desligado, plano oculto
  // ou sem cursos fecham a venda — a assinatura viva nunca passa por aqui.
  const plan = await getPlanForCheckout(sub.tenantId, sub.planId)
  if (!plan) {
    return fail(
      409,
      "PLAN_UNAVAILABLE",
      "Este plano não está mais disponível nesta loja. Fale com a loja.",
    )
  }

  const recurring = isRecurringInterval(sub.interval)
  if (resolved.gateway === "MP" && recurring && data.paymentMethod !== "CREDIT_CARD") {
    return fail(
      400,
      "METHOD_NOT_SUPPORTED",
      "Esta loja aceita assinatura recorrente apenas no cartão de crédito",
    )
  }
  const cardCheck = checkCard(data, resolved.gateway)
  if (cardCheck) return cardCheck

  const charged = await createSubscriptionAtGateway(
    {
      subscriptionId: sub.id,
      // Preço e periodicidade CONGELADOS na venda — nunca os de hoje do
      // catálogo, que podem ter mudado desde que o link foi enviado.
      plan: { ...plan, price: Number(sub.priceAtPurchase), interval: sub.interval },
      tenantId: sub.tenantId,
      billingType: data.paymentMethod,
      payer,
      cardToken: resolved.gateway === "MP" ? data.cardToken : undefined,
      mpPaymentMethodId: resolved.gateway === "MP" ? data.mpPaymentMethodId : undefined,
      mpIssuerId: resolved.gateway === "MP" ? data.mpIssuerId : undefined,
      creditCard: resolved.gateway === "ASAAS" ? data.creditCard : undefined,
      creditCardHolderInfo:
        resolved.gateway === "ASAAS" && data.creditCard && data.creditCardHolder
          ? {
              name: payer.nome,
              email: payer.email,
              cpfCnpj: payer.cpf,
              postalCode: data.creditCardHolder.postalCode,
              addressNumber: data.creditCardHolder.addressNumber,
              addressComplement: data.creditCardHolder.addressComplement,
              phone: payer.phone ?? "",
            }
          : undefined,
      remoteIp,
    },
    resolved.gateway,
    resolved.account,
  )
  if (charged.rejectedMessage) {
    return fail(400, "PAYMENT_REJECTED", charged.rejectedMessage)
  }
  return {
    ok: true,
    authorized: charged.authorized,
    ...(charged.pix ? { pix: charged.pix } : {}),
    ...(charged.boleto ? { boleto: charged.boleto } : {}),
  }
}

function checkCard(
  data: StoreSubscriptionPaymentInput,
  gateway: "MP" | "ASAAS",
): StorePaymentResult | null {
  if (data.paymentMethod !== "CREDIT_CARD") return null
  const cardReady =
    gateway === "MP"
      ? Boolean(data.cardToken)
      : Boolean(data.creditCard && data.creditCardHolder)
  return cardReady ? null : fail(400, "CARD_REQUIRED", "Dados do cartão obrigatórios")
}

/**
 * Paga a cobrança do Asaas que JÁ existe (1º ciclo emitido, renovação,
 * vitalícia): nunca cria outra por cima, que viraria duas cobranças para a
 * mesma pessoa.
 */
async function payOpenAsaasCharge(
  sub: PayableSubscription,
  data: StoreSubscriptionPaymentInput,
  resolved: ResolvedAccount,
  payer: PayerData,
  remoteIp: string | undefined,
): Promise<StorePaymentResult> {
  const apiKey = resolved.asaasApiKey
  if (!apiKey) {
    return fail(
      400,
      "GATEWAY_NOT_READY",
      "Esta loja ainda não está pronta para receber pagamentos",
    )
  }

  const charge = await findOpenAsaasCharge(sub, apiKey)
  if (!charge) {
    return sub.status === "PENDING"
      ? fail(
          409,
          "PAYMENT_PROCESSING",
          "O pagamento desta assinatura está sendo processado. Aguarde alguns instantes e atualize a página.",
        )
      : fail(409, "NO_OPEN_CHARGE", "Não há cobrança em aberto nesta assinatura.")
  }

  if (data.paymentMethod === "PIX" || data.paymentMethod === "BOLETO") {
    const instrument = await asaasInstrumentFor(charge, data.paymentMethod, apiKey)
    if (!instrument.pix && !instrument.boleto) {
      return fail(
        502,
        data.paymentMethod === "PIX" ? "PIX_UNAVAILABLE" : "BOLETO_UNAVAILABLE",
        "Não foi possível gerar o pagamento agora. Tente novamente em instantes ou escolha outro método.",
      )
    }
    return { ok: true, authorized: false, ...instrument }
  }

  const cardCheck = checkCard(data, "ASAAS")
  if (cardCheck) return cardCheck
  try {
    const paid = await payWithCreditCard(
      charge.id,
      {
        creditCard: data.creditCard!,
        creditCardHolderInfo: {
          name: payer.nome,
          email: payer.email,
          cpfCnpj: payer.cpf,
          postalCode: data.creditCardHolder!.postalCode,
          addressNumber: data.creditCardHolder!.addressNumber,
          addressComplement: data.creditCardHolder!.addressComplement,
          phone: payer.phone ?? "",
        },
        remoteIp: remoteIp ?? "0.0.0.0",
      },
      apiKey,
    )
    if (CONFIRMED_ASAAS_STATUSES.has(paid.status)) {
      // Efetiva já; o webhook que chegar depois é idempotente.
      await settleSubscriptionCycle(sub.id, {
        gateway: "ASAAS",
        externalPaymentId: paid.id,
        amount: paid.value,
        paidAt: paid.paymentDate ? new Date(paid.paymentDate) : new Date(),
        dueDate: new Date(paid.dueDate),
        billingType: "CREDIT_CARD",
      })
      return { ok: true, authorized: true }
    }
    if (paid.status === "AWAITING_RISK_ANALYSIS") return { ok: true, authorized: false }
    return fail(400, "PAYMENT_REJECTED", "Pagamento recusado. Tente outro cartão ou método.")
  } catch (err) {
    if (err instanceof AsaasApiError && err.statusCode >= 400 && err.statusCode < 500) {
      return fail(
        400,
        "PAYMENT_REJECTED",
        err.errors?.[0]?.description ?? "Pagamento recusado. Confira os dados e tente novamente.",
      )
    }
    throw err
  }
}
