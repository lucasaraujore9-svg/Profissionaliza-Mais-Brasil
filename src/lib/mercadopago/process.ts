import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email/resend"
import { decryptTenantMpToken, getPayment } from "./client"
import {
  criarAluno,
  vincularCurso,
  enviarEmailCredenciais,
} from "@/lib/escola-avancada/client"
import { validateMpWebhookSignature } from "./webhook"
import type { MPPayment } from "./types"

interface ProcessArgs {
  logId: string
  paymentId: string
  xSignature: string | null
  xRequestId: string | null
  dataId: string | null
}

async function markLog(
  logId: string,
  success: boolean,
  error?: string,
): Promise<void> {
  await prisma.webhookLog
    .update({
      where: { id: logId },
      data: {
        processed: success,
        processedAt: new Date(),
        error: error ?? null,
      },
    })
    .catch(() => undefined)
}

interface TenantContext {
  id: string
  name: string
  slug: string
  eaVendedorId: string | null
  mpAccessToken: string | null
  primaryColor: string
}

async function resolveTenantFromReference(
  externalReference: string | null,
): Promise<{ tenant: TenantContext; enrollmentId: string | null } | null> {
  if (!externalReference) return null

  const enrollment = await prisma.enrollment.findFirst({
    where: { externalReference },
    select: {
      id: true,
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true,
          eaVendedorId: true,
          mpAccessToken: true,
          primaryColor: true,
        },
      },
    },
  })
  if (enrollment) {
    return { tenant: enrollment.tenant, enrollmentId: enrollment.id }
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: externalReference },
    select: {
      id: true,
      name: true,
      slug: true,
      eaVendedorId: true,
      mpAccessToken: true,
      primaryColor: true,
    },
  })
  if (tenant) return { tenant, enrollmentId: null }

  return null
}

async function fulfillEnrollment(
  tenant: TenantContext,
  enrollmentId: string,
  payment: MPPayment,
): Promise<void> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      student: true,
      course: { select: { id: true, nome: true, eaCourseId: true } },
    },
  })
  if (!enrollment) throw new Error(`enrollment ${enrollmentId} nao encontrado`)

  const alreadyPaid = await prisma.payment.findUnique({
    where: { mpPaymentId: String(payment.id) },
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
      `[mp] curso ${enrollment.course.id} (${enrollment.course.nome}) sem eaCourseId — vinculo pulado`,
    )
  }

  await enviarEmailCredenciais(idAlunoEA).catch((err) => {
    console.error(`[mp] envioemail EA falhou para aluno ${idAlunoEA}:`, err)
  })

  await prisma.payment.create({
    data: {
      tenantId: tenant.id,
      enrollmentId: enrollment.id,
      amount: payment.transaction_amount,
      type: enrollment.paymentType,
      mpPaymentId: String(payment.id),
      mpStatus: "APPROVED",
      mpPaymentType: payment.payment_type_id,
      mpStatusDetail: payment.status_detail,
      paidAt: payment.date_approved ? new Date(payment.date_approved) : new Date(),
    },
  })

  await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: {
      status: "ACTIVE",
      mpPaymentId: String(payment.id),
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
      console.error(`[mp] enrollment email falhou (${student.email}):`, err)
    })
  }
}

export async function processMpWebhook(args: ProcessArgs): Promise<void> {
  const { logId, paymentId, xSignature, xRequestId, dataId } = args

  try {
    const mpPayment = await prisma.payment.findUnique({
      where: { mpPaymentId: paymentId },
      select: { id: true },
    })

    let tenant: TenantContext | null = null
    let enrollmentId: string | null = null
    let externalReference: string | null = null
    let payment: MPPayment | null = null

    if (!mpPayment) {
      const pending = await prisma.enrollment.findFirst({
        where: { mpPaymentId: paymentId },
        select: {
          id: true,
          externalReference: true,
          tenant: {
            select: {
              id: true,
              name: true,
              slug: true,
              eaVendedorId: true,
              mpAccessToken: true,
              primaryColor: true,
            },
          },
        },
      })
      if (pending) {
        tenant = pending.tenant
        enrollmentId = pending.id
        externalReference = pending.externalReference
      }
    }

    if (!tenant) {
      const mpQuery = dataId ?? paymentId
      const candidates = await prisma.enrollment.findMany({
        where: { externalReference: { not: null } },
        select: { externalReference: true },
        distinct: ["externalReference"],
        take: 1000,
      })

      for (const cand of candidates) {
        if (cand.externalReference && mpQuery.includes(cand.externalReference)) {
          externalReference = cand.externalReference
          break
        }
      }
    }

    if (!tenant && externalReference) {
      const resolved = await resolveTenantFromReference(externalReference)
      if (resolved) {
        tenant = resolved.tenant
        enrollmentId = resolved.enrollmentId
      }
    }

    if (!tenant || !tenant.mpAccessToken) {
      await markLog(
        logId,
        true,
        `tenant nao resolvido para payment ${paymentId}`,
      )
      return
    }

    await prisma.webhookLog
      .update({
        where: { id: logId },
        data: { tenantId: tenant.id },
      })
      .catch(() => undefined)

    const accessToken = decryptTenantMpToken(tenant.mpAccessToken)

    const secret = process.env.MP_WEBHOOK_SECRET
    if (secret) {
      const valid = validateMpWebhookSignature(
        xSignature,
        xRequestId,
        dataId ?? paymentId,
        secret,
      )
      if (!valid) {
        await markLog(logId, false, "hmac invalid")
        return
      }
    }

    payment = await getPayment(accessToken, paymentId)

    if (payment.status !== "approved") {
      await markLog(logId, true, `status=${payment.status} ignorado`)
      return
    }

    if (!enrollmentId && payment.external_reference) {
      const resolved = await resolveTenantFromReference(payment.external_reference)
      if (resolved?.enrollmentId) enrollmentId = resolved.enrollmentId
    }

    if (!enrollmentId) {
      await markLog(logId, true, "enrollment nao encontrado para fulfill")
      return
    }

    await fulfillEnrollment(tenant, enrollmentId, payment)
    await markLog(logId, true)
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido"
    console.error(`[mp] webhook processing failed (${logId}):`, error)
    await markLog(logId, false, message)
  }
}
