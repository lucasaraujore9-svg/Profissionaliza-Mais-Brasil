import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email/resend"
import {
  criarAluno,
  vincularCurso,
  enviarEmailCredenciais,
} from "@/lib/escola-avancada/client"
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
 * Idempotente: se o pagamento ja foi registrado, nao processa de novo.
 */
export async function fulfillEnrollment(
  tenant: TenantContext,
  enrollmentId: string,
  event: PaymentEvent,
): Promise<void> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      student: true,
      course: { select: { id: true, nome: true, eaCourseId: true } },
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

  let student = enrollment.student
  let eaLogin = student.eaAlunoId
  let eaSenha = student.eaAlunoSenha ?? ""
  const needsEACreation =
    !eaLogin ||
    eaLogin === "" ||
    eaLogin === "pending" ||
    Number.isNaN(Number.parseInt(eaLogin, 10))

  if (needsEACreation) {
    const nascimento = student.nascimento
      ? student.nascimento.toISOString().slice(0, 10)
      : undefined

    const result = await criarAluno({
      nome: student.nome,
      email: student.email ?? undefined,
      fone: student.fone ?? undefined,
      cpf: student.cpf ?? undefined,
      rg: student.rg ?? undefined,
      rua: student.rua ?? undefined,
      bairro: student.bairro ?? undefined,
      cidade: student.cidade ?? undefined,
      estado: student.estado ?? undefined,
      numero: student.numero ?? undefined,
      cep: student.cep ?? undefined,
      nascimento,
      sexo: student.sexo ?? undefined,
      polo: tenant.slug,
      status: "ativo",
      apostila: "liberar",
      vendedor: tenant.eaVendedorId
        ? Number.parseInt(tenant.eaVendedorId, 10) || undefined
        : undefined,
    })

    eaLogin = String(result.login)
    eaSenha = String(result.senha)

    student = await prisma.student.update({
      where: { id: student.id },
      data: {
        eaAlunoId: eaLogin,
        eaAlunoSenha: eaSenha,
        status: "ATIVO",
        apostila: "LIBERADA",
        polo: tenant.slug,
        vendedorId: tenant.eaVendedorId ?? null,
      },
    })
  } else {
    await prisma.student.update({
      where: { id: student.id },
      data: {
        status: "ATIVO",
        apostila: "LIBERADA",
      },
    })
  }

  const idCursoEA = enrollment.course.eaCourseId
    ? Number.parseInt(enrollment.course.eaCourseId, 10)
    : NaN
  const idAlunoEA = Number.parseInt(eaLogin, 10)

  if (!Number.isFinite(idAlunoEA)) {
    throw new Error(`aluno EA sem id numerico: ${eaLogin}`)
  }

  if (Number.isFinite(idCursoEA)) {
    await vincularCurso({ aluno: idAlunoEA, idcurso: idCursoEA })
  } else {
    console.warn(
      `[fulfill] curso ${enrollment.course.id} (${enrollment.course.nome}) sem eaCourseId — vinculo pulado`,
    )
  }

  await enviarEmailCredenciais(idAlunoEA).catch((err) => {
    console.error(`[fulfill] envioemail EA falhou para aluno ${idAlunoEA}:`, err)
  })

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
      status: "ACTIVE",
      mpPaymentId:
        event.gateway === "MP" ? event.externalPaymentId : enrollment.mpPaymentId,
      asaasPaymentId:
        event.gateway === "ASAAS"
          ? event.externalPaymentId
          : enrollment.asaasPaymentId,
      startedAt: new Date(),
    },
  })

  if (student.email) {
    const eaLoginUrl =
      process.env.EA_STUDENT_LOGIN_URL ?? "https://suaescola.com/aluno"

    await sendEmail({
      to: student.email,
      subject: `Matricula confirmada em ${enrollment.course.nome}`,
      template: {
        type: "enrollment",
        props: {
          studentName: student.nome,
          courseName: enrollment.course.nome,
          eaLoginUrl,
          studentLogin: eaLogin,
          studentPassword: eaSenha || "(enviada em email separado)",
        },
      },
    }).catch((err) => {
      console.error(`[fulfill] enrollment email falhou (${student.email}):`, err)
    })
  }
}
