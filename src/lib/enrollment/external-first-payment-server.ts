import type { PaymentGateway, PaymentType } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { fulfillEnrollment, type TenantContext } from "@/lib/enrollment/fulfill"
import { EXTERNAL_PAYMENT_TYPE, externalPaymentId } from "./external-first-payment"

/**
 * Dá baixa na 1ª mensalidade paga fora da plataforma: o mesmo `fulfillEnrollment`
 * de um pagamento confirmado pelo gateway — libera o curso, envia o acesso,
 * grava o `Payment` (com o id `ext_`, rotulado como pagamento externo) e conta
 * a 1ª parcela. Idempotente pelo id `ext_<matrícula>`.
 */
export async function registerExternalFirstPayment(input: {
  tenant: TenantContext
  enrollmentId: string
  gateway: PaymentGateway
  paymentType: PaymentType
  amount: number
  paidAt: Date
}): Promise<void> {
  const id = externalPaymentId(input.enrollmentId)
  await fulfillEnrollment(input.tenant, input.enrollmentId, {
    gateway: input.gateway,
    externalPaymentId: id,
    amount: input.amount,
    paidAt: input.paidAt,
    paymentType: input.paymentType,
    mpPaymentType: EXTERNAL_PAYMENT_TYPE,
  })
  // O fulfill carimba o id do pagamento na matrícula, que é onde a verificação
  // de pagamento e o cancelamento procuram a cobrança NO GATEWAY. `ext_` não
  // existe em gateway nenhum — a baixa fica só no `Payment`.
  await prisma.enrollment.updateMany({
    where: { id: input.enrollmentId, asaasPaymentId: id },
    data: { asaasPaymentId: null },
  })
  await prisma.enrollment.updateMany({
    where: { id: input.enrollmentId, mpPaymentId: id },
    data: { mpPaymentId: null },
  })
}

/** `paidAt` da baixa externa desta matrícula, ou null. */
export async function externalPaidAt(enrollmentId: string): Promise<Date | null> {
  const id = externalPaymentId(enrollmentId)
  const p = await prisma.payment.findFirst({
    where: { enrollmentId, OR: [{ asaasPaymentId: id }, { mpPaymentId: id }] },
    select: { paidAt: true },
  })
  return p?.paidAt ?? null
}
