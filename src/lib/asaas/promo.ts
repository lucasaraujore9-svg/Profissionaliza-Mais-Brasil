import { createSubscription, listPayments } from "./client"

/**
 * Soma `months` meses a uma data `YYYY-MM-DD`, ancorando no fim do mes quando o
 * dia nao existe no mes alvo (ex: 31/01 + 1 mes -> 28/02). Retorna `YYYY-MM-DD`.
 */
export function addMonths(ymd: string, months: number): string {
  const [y, m, d] = ymd.split("-").map(Number)
  // Constroi via UTC para evitar deslocamento por timezone.
  const base = new Date(Date.UTC(y, m - 1, 1))
  base.setUTCMonth(base.getUTCMonth() + months)
  // Ultimo dia do mes alvo
  const lastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate()
  base.setUTCDate(Math.min(d, lastDay))
  return base.toISOString().slice(0, 10)
}

export interface CreatePromoBillingParams {
  customerId: string
  slug: string
  name: string
  /** Valor cheio da mensalidade (assinatura regular, assume no mes N). */
  planValue: number
  /** Valor das primeiras mensalidades. */
  promoValue: number
  /** Quantas mensalidades saem no valor promo. */
  promoMonths: number
  /** Primeiro vencimento da promo (YYYY-MM-DD). A regular comeca em +N meses. */
  baseDueDate: string
}

export interface PromoBillingResult {
  promoSubscriptionId: string
  regularSubscriptionId: string
  firstPaymentId: string | null
  invoiceUrl: string | null
}

/**
 * Cria a cobranca promocional do revendedor com duas subscriptions no Asaas:
 *  - promo: `promoValue`, MONTHLY, comeca em `baseDueDate`, `maxPayments = promoMonths`
 *    (Asaas encerra a assinatura sozinho apos a N-esima cobranca).
 *  - regular: `planValue`, MONTHLY, comeca em `baseDueDate + promoMonths meses`.
 *
 * O Asaas nao suporta "primeira parcela diferente" numa unica subscription; por
 * isso usamos duas. Ambas carregam `externalReference: tenant:{slug}`. O id da
 * regular vai para `Tenant.asaasSubscriptionId` (assinatura de longo prazo) e o
 * da promo para `Tenant.asaasPromoSubscriptionId`.
 */
export async function createPromoBilling(
  params: CreatePromoBillingParams,
): Promise<PromoBillingResult> {
  const { customerId, slug, name, planValue, promoValue, promoMonths, baseDueDate } = params

  const promo = await createSubscription({
    customer: customerId,
    billingType: "UNDEFINED",
    value: promoValue,
    nextDueDate: baseDueDate,
    cycle: "MONTHLY",
    maxPayments: promoMonths,
    description: `Mensalidade promocional Profissionaliza Mais Brasil — ${name}`,
    externalReference: `tenant:${slug}`,
  })

  const regular = await createSubscription({
    customer: customerId,
    billingType: "UNDEFINED",
    value: planValue,
    nextDueDate: addMonths(baseDueDate, promoMonths),
    cycle: "MONTHLY",
    description: `Mensalidade Profissionaliza Mais Brasil — ${name}`,
    externalReference: `tenant:${slug}`,
  })

  let firstPaymentId: string | null = null
  let invoiceUrl: string | null = null
  try {
    const payments = await listPayments({ subscription: promo.id, limit: 1 })
    const firstPayment = payments.data[0] ?? null
    firstPaymentId = firstPayment?.id ?? null
    invoiceUrl = firstPayment?.invoiceUrl ?? null
  } catch {
    // sem invoiceUrl ainda — webhook atualiza depois
  }

  return {
    promoSubscriptionId: promo.id,
    regularSubscriptionId: regular.id,
    firstPaymentId,
    invoiceUrl,
  }
}
