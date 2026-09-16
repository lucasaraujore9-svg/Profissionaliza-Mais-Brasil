import type { PaymentType } from "@prisma/client"

/**
 * Regras da venda PARCELADA NO CARTÃO (`PaymentType.CARD_INSTALLMENT`) que o
 * núcleo de liberação (`fulfillEnrollment`) precisa conhecer. Módulo PURO: o
 * classificador de erro de webhook (lib/webhooks/transient.ts) importa o erro
 * daqui sem arrastar Prisma.
 *
 * No Asaas um parcelamento no cartão vira N cobranças, uma por parcela, e o
 * valor cheio é autorizado na compra — as N confirmam praticamente juntas, e os
 * webhooks das unidades são registrados como NÃO SEQUENCIAIS
 * (lib/asaas/webhook-provision.ts). Chegam em paralelo.
 */

/**
 * Uma parcela de 2..N chegou antes de a 1ª liberar o curso.
 *
 * O advisory lock do fulfill é por COBRANÇA, não por matrícula: sem esta
 * recusa, a parcela 2 veria a matrícula ainda sem `startedAt` e seguiria pelo
 * ramo da 1ª — curso liberado duas vezes, e-mail de boas-vindas duplicado e a
 * contagem de parcelas errada. Recusando, o webhook responde 500 e o gateway
 * reentrega; na volta a 1ª já liberou e ela entra como parcela seguinte.
 */
export class CardInstallmentOutOfOrderError extends Error {
  constructor(enrollmentId: string, externalPaymentId: string) {
    super(
      `parcela ${externalPaymentId} da matricula ${enrollmentId} chegou antes da 1a — aguardando reentrega`,
    )
    this.name = "CardInstallmentOutOfOrderError"
  }
}

/**
 * Esta cobrança é a 1ª parcela do parcelamento?
 *
 * `installmentNumber` vem do próprio Asaas (GET /payments/{id}). Sem ele, vale a
 * cobrança que o checkout gravou em `Enrollment.asaasPaymentId` (a de menor
 * vencimento). Na dúvida responde `false`: recusar custa uma reentrega, liberar
 * duas vezes não se desfaz.
 */
export function isFirstCardInstallment(args: {
  installmentNumber: number | null | undefined
  externalPaymentId: string
  enrollmentAsaasPaymentId: string | null
}): boolean {
  if (args.installmentNumber != null) return args.installmentNumber === 1
  return (
    args.enrollmentAsaasPaymentId !== null &&
    args.externalPaymentId === args.enrollmentAsaasPaymentId
  )
}

/**
 * Quitar a última parcela encerra a matrícula (`COMPLETED`)?
 *
 * Não no cartão parcelado. As N parcelas confirmam no dia da compra, então a
 * matrícula viraria `COMPLETED` antes de o aluno abrir a primeira aula — e
 * `COMPLETED` significa curso concluído: a elegibilidade do certificado aceita
 * esse status sozinho (lib/certificates/eligibility.ts) e a sincronização de
 * progresso só varre `ACTIVE`.
 */
export function closesOnLastInstallment(paymentType: PaymentType): boolean {
  return paymentType !== "CARD_INSTALLMENT"
}
