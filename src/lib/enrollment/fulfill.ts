import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email/mailer"
import { enviarEmailCredenciais } from "@/lib/escola-avancada/client"
import {
  ensureStudentInEA,
  linkCourseToStudent,
} from "@/lib/students/ea-actions"
import { generatePasswordWithHash } from "@/lib/students/generate-password"
import { createNotification } from "@/lib/notifications"
import type { PaymentGateway, PaymentType } from "@prisma/client"

export interface TenantContext {
  id: string
  slug: string
  eaVendedorId: string | null
  isPmbVitrine?: boolean
  /** Nome amigável da loja — usado em emails ao aluno. */
  name?: string
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
      student: {
        select: {
          id: true,
          email: true,
          nome: true,
          passwordHash: true,
        },
      },
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

    // Notifica o aluno: parcela paga
    await createNotification({
      audience: "STUDENT",
      studentId: enrollment.student.id,
      level: "SUCCESS",
      title: reachedTotal
        ? `Curso ${enrollment.course.nome} totalmente pago`
        : `Mensalidade ${newPaidCount}/${enrollment.installmentsTotal} confirmada`,
      body: reachedTotal
        ? "Parabéns! Você completou todas as mensalidades."
        : `Pagamento de R$ ${event.amount.toFixed(2).replace(".", ",")} confirmado.`,
      category: "payment",
      href: "/aluno/pagamentos",
    })

    // Notifica revendedor (se houver) que recebeu pagamento
    if (!tenant.isPmbVitrine) {
      await createNotification({
        audience: "TENANT",
        tenantId: tenant.id,
        level: "SUCCESS",
        title: `Mensalidade recebida — ${enrollment.student.nome}`,
        body: `R$ ${event.amount.toFixed(2).replace(".", ",")} (${newPaidCount}/${enrollment.installmentsTotal})`,
        category: "payment",
        href: "/painel/financeiro",
      })
    }

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

  // Gera credenciais do painel /aluno quando o aluno ainda não tem senha.
  // Vale tanto na 1ª compra (created=true) quanto em alunos antigos que nunca
  // logaram (passwordHash=null) — assim qualquer compra concluída garante
  // acesso ao painel.
  let panelPassword: string | null = null
  if (enrollment.student.email && !enrollment.student.passwordHash) {
    try {
      const { plain, hash } = await generatePasswordWithHash()
      await prisma.student.update({
        where: { id: enrollment.student.id },
        data: { passwordHash: hash, passwordSetAt: new Date() },
      })
      panelPassword = plain
    } catch (err) {
      console.error("[fulfill] falha ao gerar senha do painel:", err)
    }
  }

  // Email de boas-vindas ao painel /aluno (com senha temporária).
  // Disparamos quando geramos a senha agora — evita reenvio em recompras.
  if (panelPassword && enrollment.student.email) {
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
      "https://www.profissionalizamaisbrasil.com.br"
    let loginUrl: string
    let storeName: string
    if (tenant.isPmbVitrine) {
      loginUrl = `${appUrl}/login`
      storeName = "Profissionaliza Mais Brasil"
    } else {
      // Loja do revendedor: link pro subdomínio dele.
      const host = new URL(appUrl).host.replace(/^www\./, "")
      loginUrl = `https://${tenant.slug}.${host}/login`
      storeName = tenant.name ?? `Loja ${tenant.slug}`
    }
    await sendEmail({
      to: enrollment.student.email,
      subject: `Bem-vindo! Seu acesso ao painel ${storeName}`,
      template: {
        type: "student-welcome",
        props: {
          studentName: enrollment.student.nome,
          studentEmail: enrollment.student.email,
          temporaryPassword: panelPassword,
          loginUrl,
          storeName,
        },
      },
    }).catch((err) => {
      console.error("[fulfill] student-welcome email falhou:", err)
    })
  }

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

  // Notificacoes in-app
  await createNotification({
    audience: "STUDENT",
    studentId: enrollment.student.id,
    level: "SUCCESS",
    title: `Matrícula confirmada em ${enrollment.course.nome}`,
    body: enrollment.installmentsTotal
      ? `Primeira de ${enrollment.installmentsTotal} mensalidades paga.`
      : "Acesse a área de aulas para começar agora.",
    category: "enrollment",
    href: "/aluno/cursos",
  })

  if (!tenant.isPmbVitrine) {
    await createNotification({
      audience: "TENANT",
      tenantId: tenant.id,
      level: "SUCCESS",
      title: `Nova venda — ${enrollment.course.nome}`,
      body: `${enrollment.student.nome} comprou por R$ ${event.amount
        .toFixed(2)
        .replace(".", ",")}.`,
      category: "sale",
      href: "/painel/vendas",
    })
  } else {
    await createNotification({
      audience: "ROLE",
      roleTarget: "SUPER_ADMIN",
      level: "SUCCESS",
      title: `Venda direta — ${enrollment.course.nome}`,
      body: `${enrollment.student.nome} (vitrine PMB) — R$ ${event.amount
        .toFixed(2)
        .replace(".", ",")}.`,
      category: "sale",
      href: "/admin/vendas",
    })
  }
}
