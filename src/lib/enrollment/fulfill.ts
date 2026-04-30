import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email/resend"
import { enviarEmailCredenciais } from "@/lib/escola-avancada/client"
import {
  ensureStudentInEA,
  linkCourseToStudent,
} from "@/lib/students/ea-actions"
import type { PaymentGateway, PaymentType } from "@prisma/client"

export interface TenantContext {
  id: string
  slug: string
  eaVendedorId: string | null
  isPmbVitrine?: boolean
}

export interface PaymentEvent {
  gateway: PaymentGateway
  externalPaymentId: string
  amount: number
  paidAt: Date
  paymentType?: PaymentType
  // MP-specific
  mpPaymentType?: string
  mpStatusDetail?: string
}

/**
 * Realiza a matricula do aluno na plataforma de aulas e registra o pagamento.
 *
 * Idempotente: se o pagamento ja foi registrado, nao processa de novo.
 *
 * Para cursos MONTHLY (assinatura): a 1a cobranca cria o aluno na EA + vincula
 * o curso + envia o email de boas-vindas. As demais apenas criam o registro
 * Payment, incrementam installmentsPaid e marcam COMPLETED na ultima.
 *
 * Toda interacao com a plataforma de aulas passa por src/lib/students/ea-actions.
 * O comportamento e identico para vendas PMB e revendedor — so o polo/vendedor
 * mudam por tenant. Toda informacao financeira (Payment, gateway, valor,
 * cupom) fica no nosso banco e nunca e enviada para a EA.
 */
export async function fulfillEnrollment(
  tenant: TenantContext,
  enrollmentId: string,
  event: PaymentEvent,
): Promise<void> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      student: { select: { id: true, email: true, nome: true } },
      course: { select: { id: true, nome: true } },
    },
  })
  if (!enrollment) throw new Error(`enrollment ${enrollmentId} nao encontrado`)

  const idempotencyWhere =
    event.gateway === "MP"
      ? { mpPaymentId: event.externalPaymentId }
      : { asaasPaymentId: event.externalPaymentId }

  const alreadyPaid = await prisma.payment.findFirst({
    where: idempotencyWhere,
    select: { id: true },
  })
  if (alreadyPaid) return

  // Cobranca subsequente de uma subscription: aluno ja foi matriculado, so
  // registramos o pagamento, incrementamos a contagem e fechamos o ciclo na ultima.
  const isSubsequentInstallment =
    enrollment.startedAt !== null && enrollment.installmentsTotal !== null

  if (isSubsequentInstallment) {
    const newPaidCount = enrollment.installmentsPaid + 1
    const reachedTotal =
      enrollment.installmentsTotal !== null &&
      newPaidCount >= enrollment.installmentsTotal

    await prisma.payment.create({
      data: {
        tenantId: tenant.isPmbVitrine ? null : tenant.id,
        enrollmentId: enrollment.id,
        soldByUserId: enrollment.soldByUserId ?? null,
        amount: event.amount,
        type: event.paymentType ?? enrollment.paymentType,
        gateway: event.gateway,
        mpPaymentId: event.gateway === "MP" ? event.externalPaymentId : null,
        asaasPaymentId:
          event.gateway === "ASAAS" ? event.externalPaymentId : null,
        mpStatus: "APPROVED",
        mpPaymentType: event.mpPaymentType ?? null,
        mpStatusDetail: event.mpStatusDetail ?? null,
        paidAt: event.paidAt,
      },
    })

    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: {
        installmentsPaid: newPaidCount,
        ...(reachedTotal ? { status: "COMPLETED" } : {}),
      },
    })

    return
  }

  // Primeira cobranca: garante aluno na EA + vincula o curso (mesma rota
  // usada pelas concessoes manuais via /admin/alunos/[id]/cursos).
  const { eaAlunoId, created, eaSenha } = await ensureStudentInEA(
    enrollment.student.id,
  )
  await linkCourseToStudent(enrollment.student.id, enrollment.course.id)

  // Envia email de boas-vindas com credenciais somente quando criamos o aluno
  // agora (evita spam em recompras).
  if (created) {
    await enviarEmailCredenciais(eaAlunoId).catch((err) => {
      console.error(`[fulfill] envioemail EA falhou para aluno ${eaAlunoId}:`, err)
    })
  }

  // Primeira cobranca cobre a 1a parcela quando MONTHLY
  const firstInstallmentPaid = enrollment.installmentsTotal !== null ? 1 : 0
  const reachedTotalOnFirst =
    enrollment.installmentsTotal !== null &&
    firstInstallmentPaid >= enrollment.installmentsTotal

  await prisma.payment.create({
    data: {
      tenantId: tenant.isPmbVitrine ? null : tenant.id,
      enrollmentId: enrollment.id,
      soldByUserId: enrollment.soldByUserId ?? null,
      amount: event.amount,
      type: event.paymentType ?? enrollment.paymentType,
      gateway: event.gateway,
      mpPaymentId: event.gateway === "MP" ? event.externalPaymentId : null,
      asaasPaymentId: event.gateway === "ASAAS" ? event.externalPaymentId : null,
      mpStatus: "APPROVED",
      mpPaymentType: event.mpPaymentType ?? null,
      mpStatusDetail: event.mpStatusDetail ?? null,
      paidAt: event.paidAt,
    },
  })

  await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: {
      status: reachedTotalOnFirst ? "COMPLETED" : "ACTIVE",
      mpPaymentId:
        event.gateway === "MP" ? event.externalPaymentId : enrollment.mpPaymentId,
      asaasPaymentId:
        event.gateway === "ASAAS"
          ? event.externalPaymentId
          : enrollment.asaasPaymentId,
      startedAt: new Date(),
      installmentsPaid: firstInstallmentPaid,
    },
  })

  if (created && enrollment.student.email) {
    const eaLoginUrl =
      process.env.EA_STUDENT_LOGIN_URL ?? "https://suaescola.com/aluno"

    await sendEmail({
      to: enrollment.student.email,
      subject: `Matricula confirmada em ${enrollment.course.nome}`,
      template: {
        type: "enrollment",
        props: {
          studentName: enrollment.student.nome,
          courseName: enrollment.course.nome,
          eaLoginUrl,
          studentLogin: String(eaAlunoId),
          studentPassword: eaSenha ?? "(enviada em email separado)",
        },
      },
    }).catch((err) => {
      console.error(`[fulfill] enrollment email falhou:`, err)
    })
  }
}
