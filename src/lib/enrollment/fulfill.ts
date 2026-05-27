import { createHash } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email/mailer"
import { enviarEmailCredenciais } from "@/lib/plataforma-cursos/client"
import {
  ensureStudentOnPlatform,
  linkCourseToStudent,
} from "@/lib/students/plataforma-actions"
import { generatePasswordWithHash } from "@/lib/students/generate-password"
import { createNotification } from "@/lib/notifications"
import { appUrl as resolveAppUrl, vitrineHost } from "@/lib/tenant/urls"
import type { PaymentGateway, PaymentType } from "@prisma/client"
import { swallow } from "@/lib/errors"
import { contextLogger } from "@/lib/logger"

/**
 * Postgres advisory lock por externalPaymentId. Serializa fulfill de dois
 * webhooks paralelos (MP/Asaas re-entregam em casos de timeout) — evita que
 * `ensureStudentOnPlatform` e `linkCourseToStudent` sejam chamados duas vezes,
 * o que criaria aluno duplicado na plataforma parceira ou enviaria email de
 * boas-vindas duplicado.
 *
 * Idempotência via findFirst({mpPaymentId}) sozinha NÃO basta: há uma janela
 * entre o findFirst e o payment.create onde dois processos paralelos podem
 * ambos passar o check. Com o lock, o segundo espera o primeiro terminar e
 * então encontra o Payment criado, fazendo no-op.
 *
 * Use `pg_try_advisory_xact_lock` (não-bloqueante) com hash 64-bit do
 * externalPaymentId. Se outro processo segura o lock, aborta — webhook é
 * re-entregue mais tarde quando o primeiro já terminou.
 */
function advisoryLockKey(gateway: PaymentGateway, externalPaymentId: string): bigint {
  // Hash truncado para 63 bits (Postgres bigint signed, evita overflow).
  // BigInt() constructor em vez de literal `n` pra compat com target ES2017.
  const h = createHash("sha256").update(`${gateway}:${externalPaymentId}`).digest()
  const high = h.readBigUInt64BE(0)
  return high & BigInt("0x7fffffffffffffff")
}

export interface TenantContext {
  id: string
  slug: string
  plataformaVendedorId: string | null
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
 * Para cursos MONTHLY (assinatura): a 1a cobranca cria o aluno na plataforma + vincula
 * o curso + envia o email de boas-vindas. As demais apenas criam o registro
 * Payment, incrementam installmentsPaid e marcam COMPLETED na ultima.
 *
 * Toda interacao com a plataforma de aulas passa por src/lib/students/plataforma-actions.
 * O comportamento e identico para vendas PMB e revendedor — so o polo/vendedor
 * mudam por tenant. Toda informacao financeira (Payment, gateway, valor,
 * cupom) fica no nosso banco e nunca e enviada para a plataforma.
 */
export async function fulfillEnrollment(
  tenant: TenantContext,
  enrollmentId: string,
  event: PaymentEvent,
): Promise<void> {
  // ── Lock distribuído via Postgres advisory lock ──────────────────────────
  // Garante que apenas UM processo executa fulfill para um dado externalPaymentId
  // por vez. `pg_try_advisory_lock` é não-bloqueante: se outro processo segura
  // o lock, retorna false e abortamos — webhook é re-entregue depois.
  // O lock vive enquanto a conexão estiver aberta; liberamos explicitamente
  // no finally pra não vazar em pools longos (Supabase pooler).
  const lockKey = advisoryLockKey(event.gateway, event.externalPaymentId)
  const lockResult = await prisma.$queryRaw<Array<{ pg_try_advisory_lock: boolean }>>`
    SELECT pg_try_advisory_lock(${lockKey}::bigint)
  `
  const acquired = lockResult[0]?.pg_try_advisory_lock === true
  if (!acquired) {
    contextLogger().info(
      {
        event: "fulfill.lock_busy",
        gateway: event.gateway,
        externalPaymentId: event.externalPaymentId,
      },
      "outro processo já está executando fulfill deste pagamento — abortando",
    )
    return
  }

  try {
    await fulfillEnrollmentLocked(tenant, enrollmentId, event)
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${lockKey}::bigint)`.catch(
      swallow("fulfill.unlock"),
    )
  }
}

async function fulfillEnrollmentLocked(
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

    // Transação para garantir que Payment + Enrollment.update sejam atômicos.
    // Se uma falha, nenhuma é persistida — o webhook é re-entregue e tudo
    // re-tenta limpamente (idempotência via mpPaymentId no início da função).
    await prisma.$transaction([
      prisma.payment.create({
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
      }),
      prisma.enrollment.update({
        where: { id: enrollment.id },
        data: {
          installmentsPaid: newPaidCount,
          ...(reachedTotal ? { status: "COMPLETED" } : {}),
        },
      }),
    ])

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

  // Primeira cobranca: garante aluno na plataforma + vincula o curso (mesma rota
  // usada pelas concessoes manuais via /admin/alunos/[id]/cursos).
  const { plataformaAlunoId, created, plataformaSenha } =
    await ensureStudentOnPlatform(enrollment.student.id)
  await linkCourseToStudent(enrollment.student.id, enrollment.course.id)

  // Envia email de boas-vindas com credenciais somente quando criamos o aluno
  // agora (evita spam em recompras).
  if (created) {
    await enviarEmailCredenciais(plataformaAlunoId).catch((err) => {
      contextLogger().error(
        { err, event: "fulfill.plataforma_email_failed", plataformaAlunoId },
        "envioemail da plataforma falhou para aluno",
      )
    })
  }

  // Primeira cobranca cobre a 1a parcela quando MONTHLY
  const firstInstallmentPaid = enrollment.installmentsTotal !== null ? 1 : 0
  const reachedTotalOnFirst =
    enrollment.installmentsTotal !== null &&
    firstInstallmentPaid >= enrollment.installmentsTotal

  // Transação para Payment + Enrollment.update — evita estado inconsistente
  // (Payment órfão com Enrollment.PENDING) se a 2ª query falhar.
  await prisma.$transaction([
    prisma.payment.create({
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
    }),
    prisma.enrollment.update({
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
    }),
  ])

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
      contextLogger().error(
        { err, event: "fulfill.panel_password_failed", studentId: enrollment.student.id },
        "falha ao gerar senha do painel do aluno",
      )
    }
  }

  // Email de boas-vindas ao painel /aluno (com senha temporária).
  // Disparamos quando geramos a senha agora — evita reenvio em recompras.
  if (panelPassword && enrollment.student.email) {
    const appUrl = resolveAppUrl().replace(/\/$/, "")
    let loginUrl: string
    let storeName: string
    if (tenant.isPmbVitrine) {
      loginUrl = `${appUrl}/login`
      storeName = "Profissionaliza Mais Brasil"
    } else {
      // Loja do revendedor: link pro subdominio no dominio de vitrines.
      loginUrl = `https://${vitrineHost(tenant.slug)}/login`
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
      contextLogger().error(
        { err, event: "fulfill.student_welcome_email_failed", studentId: enrollment.student.id },
        "student-welcome email falhou",
      )
    })
  }

  if (created && enrollment.student.email) {
    // Link sempre aponta para a área do aluno DENTRO do nosso sistema
    // (vitrine do revendedor ou app PMB). De lá o aluno encontra o botão
    // "área de aulas" que abre a plataforma parceira. Evita vazar URL da
    // plataforma parceira e mantém o white-label.
    const appBase = resolveAppUrl().replace(/\/$/, "")
    let studentPanelUrl: string
    let storeName: string
    if (tenant.isPmbVitrine) {
      studentPanelUrl = `${appBase}/aluno`
      storeName = "Profissionaliza Mais Brasil"
    } else {
      studentPanelUrl = `https://${vitrineHost(tenant.slug)}/aluno`
      storeName = tenant.name ?? `Loja ${tenant.slug}`
    }

    let emailSent = false
    try {
      await sendEmail({
        to: enrollment.student.email,
        subject: `Matrícula confirmada em ${enrollment.course.nome}`,
        template: {
          type: "enrollment",
          props: {
            studentName: enrollment.student.nome,
            courseName: enrollment.course.nome,
            studentPanelUrl,
            storeName,
          },
        },
      })
      emailSent = true
    } catch (err) {
      contextLogger().error(
        { err, event: "fulfill.enrollment_email_failed", enrollmentId: enrollment.id, studentId: enrollment.student.id },
        "enrollment email falhou",
      )
    }

    // Segurança: zera a senha plaintext da plataforma do banco assim que
    // confirmamos a entrega do email. A senha da plataforma é entregue
    // separadamente pelo `enviarEmailCredenciais` (chamado acima); aqui
    // só limpamos o cache local. Se DB vazar depois disso, atacante
    // não consegue logar como aluno na plataforma — só restaria fluxo
    // "esqueci senha" da plataforma parceira.
    if (emailSent && plataformaSenha) {
      await prisma.student
        .update({
          where: { id: enrollment.student.id },
          data: { plataformaAlunoSenha: null },
        })
        .catch(swallow("fulfill.clearPlataformaSenha"))
    }
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
