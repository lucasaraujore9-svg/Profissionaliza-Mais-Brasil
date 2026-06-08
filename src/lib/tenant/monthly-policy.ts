/**
 * Politica de pagamento parcelado/mensalidade (PaymentType.MONTHLY) por unidade.
 *
 * Dois niveis de controle:
 * - monthlyAllowed: capability liberada pelo Admin Master.
 * - monthlyEnabled: revendedor liga/desliga o uso (dentro do que foi liberado).
 * - monthlyScope: onde o parcelado vale (definido pelo Admin Master).
 *
 * Efetivo = monthlyAllowed && monthlyEnabled. O escopo decide em quais canais
 * o MONTHLY e honrado; quando nao for, o curso cai para ONE_TIME naquele canal.
 */

export type MonthlyChannel = "vitrine" | "direct"

export type MonthlyPolicy = {
  monthlyAllowed: boolean
  monthlyEnabled: boolean
  monthlyScope: "DIRECT_ONLY" | "DIRECT_AND_VITRINE"
}

/** A unidade pode oferecer parcelado (admin liberou E revendedor ativou). */
export function monthlyActive(t: MonthlyPolicy): boolean {
  return t.monthlyAllowed && t.monthlyEnabled
}

/** O parcelado e honrado no canal informado. */
export function monthlyAllowedOn(t: MonthlyPolicy, channel: MonthlyChannel): boolean {
  if (!monthlyActive(t)) return false
  if (channel === "direct") return true
  return t.monthlyScope === "DIRECT_AND_VITRINE"
}

/**
 * Tipo de pagamento efetivo de um curso num canal. Se o curso e MONTHLY mas o
 * parcelado nao e permitido naquele canal, cai para ONE_TIME.
 */
export function effectivePaymentType(
  paymentType: "ONE_TIME" | "MONTHLY",
  t: MonthlyPolicy,
  channel: MonthlyChannel,
): "ONE_TIME" | "MONTHLY" {
  if (paymentType === "MONTHLY" && !monthlyAllowedOn(t, channel)) {
    return "ONE_TIME"
  }
  return paymentType
}
