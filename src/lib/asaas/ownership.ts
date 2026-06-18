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

  // As rotas /cobranca operam EXCLUSIVAMENTE na conta Asaas global da PMB
  // (mensalidades de revenda = TenantPayment; vendas da vitrine PMB = Payment com
  // tenantId=null). Pagamentos de venda de revenda (Payment.tenantId != null)
  // vivem na conta Asaas da PRÓPRIA unidade — a conta global nem consegue lê-los
  // (getPayment 404). Restringimos o guard a esse escopo para não dar a impressão
  // de que esses ids são "conhecidos" por estas rotas.
  const [studentPayment, tenantPayment] = await Promise.all([
    prisma.payment.findFirst({
      where: { asaasPaymentId: paymentId, tenantId: null },
      select: { id: true },
    }),
    prisma.tenantPayment.findFirst({
      where: { asaasPaymentId: paymentId },
      select: { id: true },
    }),
  ])

  return Boolean(studentPayment || tenantPayment)
}
