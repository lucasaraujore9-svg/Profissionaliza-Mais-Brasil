import { fulfillEnrollment } from "@/lib/enrollment/fulfill"
import { markLeadAsWon } from "@/lib/automation/leads"
import { swallow } from "@/lib/errors"
import type { MPPayment } from "./types"

/**
 * Tenant mínimo necessário para efetivar uma matrícula a partir de um
 * pagamento do Mercado Pago. Compartilhado pelo webhook (`process.ts`) e pelo
 * fluxo síncrono do Checkout Transparente (`/process` routes) — fonte única de
 * verdade para o fulfillment via MP.
 */
export interface MpFulfillTenant {
  id: string
  slug: string
  name: string
  plataformaVendedorId: string | null
  isPmbVitrine?: boolean
}

/**
 * Efetiva a matrícula (matrícula na plataforma parceira + Payment local) a
 * partir de um pagamento aprovado do MP e move o lead vinculado para WON.
 *
 * `fulfillEnrollment` é idempotente: se o webhook e o retorno síncrono do
 * checkout transparente dispararem para o mesmo pagamento, o segundo é no-op.
 */
export async function fulfillFromMpPayment(
  tenant: MpFulfillTenant,
  enrollmentId: string,
  payment: MPPayment,
): Promise<void> {
  await fulfillEnrollment(
    {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      plataformaVendedorId: tenant.plataformaVendedorId,
      isPmbVitrine: tenant.isPmbVitrine,
    },
    enrollmentId,
    {
      gateway: "MP",
      externalPaymentId: String(payment.id),
      amount: payment.transaction_amount,
      paidAt: payment.date_approved
        ? new Date(payment.date_approved)
        : new Date(),
      mpPaymentType: payment.payment_type_id,
      mpStatusDetail: payment.status_detail,
    },
  )

  await markLeadAsWon({
    enrollmentId,
    tenantId: tenant.isPmbVitrine ? null : tenant.id,
    amount: payment.transaction_amount,
  }).catch(swallow("mp.fulfill.lead_won"))
}
