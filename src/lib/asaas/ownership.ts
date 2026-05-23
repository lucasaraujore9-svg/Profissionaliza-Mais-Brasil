import { prisma } from "@/lib/prisma"

/**
 * Garante que o paymentId em questão pertence a uma cobrança rastreada pelo
 * sistema (Payment de aluno ou TenantPayment de revendedor). Evita que rotas
 * publicas de cobranca virem oraculo de qualquer pay_xxxx da conta Asaas.
 *
 * Retorna `true` se encontrou, `false` caso contrario — chamadores podem
 * responder 404 sem revelar mais informacao.
 */
export async function isKnownAsaasPayment(paymentId: string): Promise<boolean> {
  if (!paymentId || typeof paymentId !== "string") return false

  const [studentPayment, tenantPayment] = await Promise.all([
    prisma.payment.findFirst({
      where: { asaasPaymentId: paymentId },
      select: { id: true },
    }),
    prisma.tenantPayment.findFirst({
      where: { asaasPaymentId: paymentId },
      select: { id: true },
    }),
  ])

  return Boolean(studentPayment || tenantPayment)
}
