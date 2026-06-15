import { fulfillEnrollment } from "@/lib/enrollment/fulfill"
import { markLeadAsWon } from "@/lib/automation/leads"
import { swallow } from "@/lib/errors"
import type { PaymentType } from "@prisma/client"
import type { AsaasPayment } from "./types"

/**
 * Tenant mínimo para efetivar uma matrícula a partir de um pagamento Asaas da
 * conta PRÓPRIA da unidade (revendedor recebendo do aluno). Espelha
 * `MpFulfillTenant`. `isPmbVitrine` nunca é true aqui — a vitrine PMB usa o
 * fluxo Asaas global (processPmbDirectSale), não este.
 */
export interface AsaasFulfillTenant {
  id: string
  slug: string
  name: string
  plataformaVendedorId: string | null
}

/**
 * Efetiva a matrícula (matrícula na plataforma parceira + Payment local) a
 * partir de um pagamento Asaas confirmado e move o lead vinculado para WON.
 *
 * `fulfillEnrollment` é idempotente (advisory lock + asaasPaymentId): se o
 * webhook e o retorno síncrono do checkout dispararem para o mesmo pagamento,
 * o segundo é no-op. Compartilhado pelo checkout síncrono e pelo webhook.
 */
export async function fulfillFromAsaasPayment(
  tenant: AsaasFulfillTenant,
  enrollmentId: string,
  payment: AsaasPayment,
  paymentType?: PaymentType,
): Promise<void> {
  await fulfillEnrollment(
    {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      plataformaVendedorId: tenant.plataformaVendedorId,
      isPmbVitrine: false,
    },
    enrollmentId,
    {
      gateway: "ASAAS",
      externalPaymentId: payment.id,
      amount: payment.value,
      paidAt: payment.paymentDate ? new Date(payment.paymentDate) : new Date(),
      paymentType,
    },
  )

  await markLeadAsWon({
    enrollmentId,
    tenantId: tenant.id,
    amount: payment.value,
  }).catch(swallow("asaas.fulfill.lead_won"))
}
