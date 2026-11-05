/**
 * Politica de pagamento parcelado/mensalidade (PaymentType.MONTHLY) por unidade.
 *
 * Dois niveis de controle:
 * - monthlyAllowed: capability liberada pelo Admin Master.
 * - monthlyEnabled: revendedor liga/desliga o uso (dentro do que foi liberado).
 * - monthlyScope: onde o parcelado vale (definido pelo Admin Master).
 *
 * Efetivo = monthlyAllowed && monthlyEnabled.
 *
 * REGRA DE CANAL (2026-11-05, decisao do dono): mensalidade e carne so existem
 * na VENDA DIRETA. Na vitrine (loja da unidade, vitrine da PMB, recompra do
 * aluno) o curso e sempre PAGAMENTO UNICO pelo TOTAL — o aluno paga tudo ali,
 * no PIX, no boleto ou parcelado no cartao. Um curso configurado como "3x de
 * R$ 53" e vendido na vitrine por R$ 159 (`vitrineCoursePrice`).
 *
 * Antes, `monthlyScope = DIRECT_AND_VITRINE` fazia a vitrine vender o curso
 * como recorrencia do gateway (so cartao): a tela oferecia PIX/boleto e o
 * pagamento recusava "Assinatura mensal exige cartao de credito". E com
 * `DIRECT_ONLY` era pior: o curso caia para pagamento unico pelo valor de UMA
 * mensalidade. `monthlyScope` segue no banco, mas nao abre mais a vitrine.
 * "Assinatura" de verdade e o produto de planos (`StudentSubscription`).
 */

import type { PaymentType } from "@prisma/client"

export type MonthlyChannel = "vitrine" | "direct"

/**
 * Tipo de pagamento do CURSO. O enum PaymentType do Prisma tambem tem
 * BOLETO_INSTALLMENT, mas esse valor e uma escolha da VENDA (carne), nunca um
 * atributo do curso — cursos sao sempre ONE_TIME ou MONTHLY. Este alias mantem
 * essa invariante explicita no dominio.
 */
export type CoursePaymentType = "ONE_TIME" | "MONTHLY"

/** Normaliza o paymentType lido do curso para o par 2-valores do dominio. */
export function coursePaymentType(pt: PaymentType): CoursePaymentType {
  return pt === "MONTHLY" ? "MONTHLY" : "ONE_TIME"
}

export type MonthlyPolicy = {
  monthlyAllowed: boolean
  monthlyEnabled: boolean
  monthlyScope: "DIRECT_ONLY" | "DIRECT_AND_VITRINE"
}

/** A unidade pode oferecer parcelado (admin liberou E revendedor ativou). */
export function monthlyActive(t: MonthlyPolicy): boolean {
  return t.monthlyAllowed && t.monthlyEnabled
}

/** O parcelado e honrado no canal informado — so na venda direta. */
export function monthlyAllowedOn(t: MonthlyPolicy, channel: MonthlyChannel): boolean {
  return channel === "direct" && monthlyActive(t)
}

/**
 * Tipo de pagamento efetivo de um curso num canal. Se o curso e MONTHLY mas o
 * parcelado nao e permitido naquele canal, cai para ONE_TIME.
 */
export function effectivePaymentType(
  paymentType: PaymentType,
  t: MonthlyPolicy,
  channel: MonthlyChannel,
): CoursePaymentType {
  const base = coursePaymentType(paymentType)
  if (base === "MONTHLY" && !monthlyAllowedOn(t, channel)) {
    return "ONE_TIME"
  }
  return base
}

/**
 * Quantidade de mensalidades de um curso MONTHLY de unidade: o que a unidade
 * definiu em /painel/cursos ("Quantidade de mensalidades"), senao o do catalogo
 * da PMB. Fonte unica para o que a vitrine soma e o que a venda direta cobra —
 * antes a venda direta ignorava o numero da unidade e criava 12 mensalidades.
 */
export function tenantCourseMonths(
  customParcelas: number | null | undefined,
  monthlyMonthsMain: number | null | undefined,
): number {
  return customParcelas ?? monthlyMonthsMain ?? 12
}

/**
 * Preco que a VITRINE cobra por um curso. O preco de um curso MONTHLY e o valor
 * da MENSALIDADE; na vitrine ele vira o TOTAL (mensalidade x meses), pago de uma
 * vez. Vale tambem para o "De R$" riscado, que a unidade digita na mesma base.
 */
export function vitrineCoursePrice(
  paymentType: PaymentType,
  price: number,
  months: number,
): number {
  if (coursePaymentType(paymentType) !== "MONTHLY") return price
  return Math.round(price * months * 100) / 100
}
