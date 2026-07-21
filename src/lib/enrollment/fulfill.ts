import { createHash } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email/mailer"
import { PMB_EMAIL_BRAND, emailFromForBrand } from "@/lib/email/brand"
import { loadTenantEmailBrand } from "@/lib/email/tenant-brand"
import { enviarEmailCredenciais } from "@/lib/plataforma-cursos/client"
import {
  ensureStudentOnPlatform,
  linkCourseToStudent,
} from "@/lib/students/plataforma-actions"
import { createLmsEnrollment, type LmsEnrollmentResponse } from "@/lib/lms"
import { encrypt } from "@/lib/crypto"
import { getStudentPlatformLoginUrl } from "@/lib/students/platform-credentials"
import type { EnrollmentSchoolAccess } from "@/lib/email/templates/enrollment"
import { generatePasswordWithHash } from "@/lib/students/generate-password"
import { createNotification } from "@/lib/notifications"
import { addMonthsClamped } from "@/lib/dates"
import { appUrl as resolveAppUrl } from "@/lib/tenant/urls"
import { afterResponse } from "@/lib/after-response"

/**
 * Prazo padrão de permanência do aluno na plataforma (item 11 dos
 * aperfeiçoamentos): 12 meses contados da liberação do acesso (primeira
 * cobrança). Após esse período, o acesso é encerrado pelo cron
 * `sweep-students-expired`.
 */
export const STUDENT_ACCESS_MONTHS = 12
import type { PaymentGateway, PaymentType, CourseProvider } from "@prisma/client"
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
function advisoryLockKeyFrom(seed: string): bigint {
  // Hash truncado para 63 bits (Postgres bigint signed, evita overflow).
  // BigInt() constructor em vez de literal `n` pra compat com target ES2017.
  const h = createHash("sha256").update(seed).digest()
  const high = h.readBigUInt64BE(0)
  return high & BigInt("0x7fffffffffffffff")
}

function advisoryLockKey(gateway: PaymentGateway, externalPaymentId: string): bigint {
  return advisoryLockKeyFrom(`${gateway}:${externalPaymentId}`)
}

/**
 * Roda `fn` sob advisory lock do Postgres. Devolve `false` quando outro
 * processo ja detem o lock (nada foi executado).
 *
 * `pg_try_advisory_lock` e nao-bloqueante; o unlock vai no finally para nao
 * vazar lock em pool longo (Supabase pooler).
 */
async function withAdvisoryLock(
  lockKey: bigint,
  fn: () => Promise<void>,
): Promise<boolean> {
  const lockResult = await prisma.$queryRaw<Array<{ pg_try_advisory_lock: boolean }>>`
    SELECT pg_try_advisory_lock(${lockKey}::bigint)
  `
  if (lockResult[0]?.pg_try_advisory_lock !== true) return false
  try {
    await fn()
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${lockKey}::bigint)`.catch(
      swallow("fulfill.unlock"),
    )
  }
  return true
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
  const ran = await withAdvisoryLock(
    advisoryLockKey(event.gateway, event.externalPaymentId),
    () => fulfillEnrollmentLocked(tenant, enrollmentId, event),
  )
  if (!ran) {
    contextLogger().info(
      {
        event: "fulfill.lock_busy",
        gateway: event.gateway,
        externalPaymentId: event.externalPaymentId,
      },
      "outro processo já está executando fulfill deste pagamento — abortando",
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
          lmsStudentId: true,
        },
      },
      course: {
        select: { id: true, nome: true, provider: true, lmsCourseId: true },
      },
      coursePackage: { select: { id: true, name: true } },
    },
  })
  if (!enrollment) throw new Error(`enrollment ${enrollmentId} nao encontrado`)

  // ── Defesa em profundidade central: Payment.tenantId === Enrollment.tenantId ──
  // A fonte ÚNICA da verdade de atribuição é o Enrollment. O TenantContext vem do
  // call-site (webhook MP/Asaas, reconcile, admin sync) — hoje todos resolvem a
  // matrícula escopada ao tenant, mas se QUALQUER fluxo (atual ou futuro) passar
  // um enrollmentId de um tenant diferente do contexto, recusamos aqui em vez de
  // gravar receita cruzada (revenda↔revenda↔PMB). Converte uma regressão
  // silenciosa numa falha auditável (no webhook, vira markLog(false) + alerta;
  // nas rotas síncronas, erro ao operador). Erro NÃO é transitório → sem retry.
  const expectedTenantId = tenant.isPmbVitrine ? null : tenant.id
  if (enrollment.tenantId !== expectedTenantId) {
    throw new Error(
      `fulfill tenant mismatch: enrollment ${enrollmentId} pertence a ` +
        `${enrollment.tenantId ?? "PMB"} mas o contexto é ${expectedTenantId ?? "PMB"}`,
    )
  }

  const idempotencyWhere =
    event.gateway === "MP"
      ? { mpPaymentId: event.externalPaymentId }
      : { asaasPaymentId: event.externalPaymentId }

  const alreadyPaid = await prisma.payment.findFirst({
    where: idempotencyWhere,
    select: { id: true },
  })
  if (alreadyPaid) return

  // Termo da cobrança recorrente na copy: carnê/cartão parcelado falam
  // "parcela"; mensal, "mensalidade".
  const isParcelado =
    enrollment.paymentType === "BOLETO_INSTALLMENT" ||
    enrollment.paymentType === "CARD_INSTALLMENT"
  const parcelaWord = isParcelado ? "Parcela" : "Mensalidade"
  const parcelasWord = isParcelado ? "parcelas" : "mensalidades"

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
          tenantId: expectedTenantId,
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
        : `${parcelaWord} ${newPaidCount}/${enrollment.installmentsTotal} confirmada`,
      body: reachedTotal
        ? `Parabéns! Você completou todas as ${parcelasWord}.`
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
        title: `${parcelaWord} recebida — ${enrollment.student.nome}`,
        body: `R$ ${event.amount.toFixed(2).replace(".", ",")} (${newPaidCount}/${enrollment.installmentsTotal})`,
        category: "payment",
        href: "/painel/financeiro",
      })
    }

    return
  }

  // Primeira cobranca: provisiona acesso do aluno (plataforma de aulas + emails).
  // Reutilizado pela concessao de bolsa (fulfillScholarshipEnrollment).
  // Idempotency-Key do LMS = id do pagamento (estavel entre re-entregas do webhook).
  await provisionEnrollmentAccess(tenant, enrollment, event.externalPaymentId)

  // Primeira cobranca cobre a 1a parcela quando MONTHLY
  const firstInstallmentPaid = enrollment.installmentsTotal !== null ? 1 : 0
  const reachedTotalOnFirst =
    enrollment.installmentsTotal !== null &&
    firstInstallmentPaid >= enrollment.installmentsTotal

  // Liberação do acesso + prazo de permanência (12 meses) a partir de agora.
  const accessStartedAt = new Date()
  const accessExpiresAt = addMonthsClamped(accessStartedAt, STUDENT_ACCESS_MONTHS)

  // Pacote de cursos: a matrícula primária já liberou o 1º curso acima. Agora
  // liberamos os demais cursos do pacote (link na plataforma + matrícula
  // satélite ACTIVE, finalAmount 0 — sem Payment, sem dupla receita). Antes do
  // Payment para herdar a retry-safety do webhook. Best-effort por curso:
  // uma falha alerta o admin mas não bloqueia a ativação do pacote inteiro.
  if (enrollment.coursePackageId) {
    await provisionPackageSiblings(
      tenant,
      enrollment,
      accessStartedAt,
      accessExpiresAt,
    )
  }

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
        startedAt: accessStartedAt,
        expiresAt: accessExpiresAt,
        // Acesso (re)liberado: zera o funil de avisos do fim do prazo para que
        // os marcos 60/30/15/2 sejam reenviados sobre o novo `expiresAt`.
        accessWarnDaysSent: [],
        installmentsPaid: firstInstallmentPaid,
      },
    }),
  ])

  // Nome do item comprado: pacote (quando houver) ou o curso avulso.
  const purchaseName = enrollment.coursePackage
    ? `pacote ${enrollment.coursePackage.name}`
    : enrollment.course.nome

  // Notificacoes in-app
  await createNotification({
    audience: "STUDENT",
    studentId: enrollment.student.id,
    level: "SUCCESS",
    title: `Matrícula confirmada — ${purchaseName}`,
    body: enrollment.coursePackage
      ? "Todos os cursos do pacote foram liberados. Acesse a área de aulas."
      : enrollment.installmentsTotal
        ? `Primeira de ${enrollment.installmentsTotal} ${parcelasWord} paga.`
        : "Acesse a área de aulas para começar agora.",
    category: "enrollment",
    href: "/aluno/cursos",
    // O email de matrícula dedicado (template `enrollment`) já é enviado em
    // provisionEnrollmentAccess — não duplicar via ponte notificação→email.
    suppressEmail: true,
  })

  if (!tenant.isPmbVitrine) {
    await createNotification({
      audience: "TENANT",
      tenantId: tenant.id,
      level: "SUCCESS",
      title: `Nova venda — ${purchaseName}`,
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
      title: `Venda direta — ${purchaseName}`,
      body: `${enrollment.student.nome} (vitrine PMB) — R$ ${event.amount
        .toFixed(2)
        .replace(".", ",")}.`,
      category: "sale",
      href: "/admin/vendas",
    })
  }
}

/**
 * Libera os cursos restantes de um pacote para o aluno: vincula cada curso na
 * plataforma de aulas e cria a matrícula satélite ACTIVE (finalAmount 0, sem
 * Payment). O 1º curso (matrícula primária) já foi provisionado pelo chamador.
 *
 * Best-effort por curso: uma falha de vínculo alerta o SUPER_ADMIN e segue para
 * os demais — não rethrow, para não bloquear a ativação do pacote já pago.
 */
async function provisionPackageSiblings(
  tenant: TenantContext,
  enrollment: {
    id: string
    courseId: string
    coursePackageId: string | null
    gateway: PaymentGateway
    soldByUserId: string | null
    student: { id: string; nome: string; email: string | null }
  },
  startedAt: Date,
  expiresAt: Date,
): Promise<void> {
  if (!enrollment.coursePackageId) return
  const expectedTenantId = tenant.isPmbVitrine ? null : tenant.id

  const items = await prisma.coursePackageItem.findMany({
    where: { packageId: enrollment.coursePackageId },
    orderBy: { order: "asc" },
    include: {
      course: {
        select: { id: true, nome: true, status: true, provider: true, lmsCourseId: true },
      },
    },
  })

  for (const item of items) {
    if (item.course.id === enrollment.courseId) continue // primário já liberado
    if (item.course.status !== "ATIVO") continue

    let provisioned: Awaited<ReturnType<typeof provisionCourseForStudent>> | null = null
    try {
      // Idempotency-Key estavel por (matricula primaria, curso) para o LMS.
      provisioned = await provisionCourseForStudent(
        tenant,
        enrollment.student,
        item.course,
        `pkg:${enrollment.id}:${item.course.id}`,
      )
    } catch (err) {
      contextLogger().error(
        {
          err,
          event: "fulfill.package_sibling_link_failed",
          enrollmentId: enrollment.id,
          studentId: enrollment.student.id,
          courseId: item.course.id,
          packageId: enrollment.coursePackageId,
        },
        "vínculo de curso do pacote falhou — alertando admin",
      )
      await createNotification({
        audience: "ROLE",
        roleTarget: "SUPER_ADMIN",
        level: "ERROR",
        title: "Curso de pacote não liberado",
        body: `Aluno ${enrollment.student.nome}: o curso "${item.course.nome}" do pacote não pôde ser vinculado na plataforma. Libere manualmente.`,
        category: "fulfillment",
        href: `/admin/alunos/${enrollment.student.id}`,
      }).catch(swallow("fulfill.notify_package_sibling"))
      continue
    }
    if (!provisioned) continue // inalcançável (o catch faz continue) — satisfaz o TS

    // Cria a matrícula satélite só se o aluno ainda não tiver acesso ao curso.
    const existing = await prisma.enrollment.findFirst({
      where: {
        studentId: enrollment.student.id,
        courseId: item.course.id,
        tenantId: expectedTenantId,
        status: { in: ["PENDING", "ACTIVE", "COMPLETED"] },
      },
      select: { id: true },
    })
    if (existing) continue

    await prisma.enrollment.create({
      data: {
        tenantId: expectedTenantId,
        studentId: enrollment.student.id,
        courseId: item.course.id,
        coursePackageId: enrollment.coursePackageId,
        packagePrimary: false,
        soldByUserId: enrollment.soldByUserId ?? null,
        paymentType: "ONE_TIME",
        status: "ACTIVE",
        gateway: enrollment.gateway,
        originalAmount: 0,
        discountAmount: 0,
        finalAmount: 0,
        startedAt,
        expiresAt,
        lmsEnrollmentId: provisioned.lmsEnrollmentId,
        lmsOrigin: provisioned.lmsOrigin,
        lmsPlayback: provisioned.lmsPlayback,
        lmsLogin: provisioned.lmsLogin,
        lmsSenha: provisioned.lmsSenha,
        lmsPortalUrl: provisioned.lmsPortalUrl,
      },
    })
  }
}

/** Forma minima do enrollment carregado que provisionEnrollmentAccess precisa. */
interface EnrollmentForProvision {
  id: string
  student: {
    id: string
    email: string | null
    nome: string
    passwordHash: string | null
    lmsStudentId: string | null
  }
  course: {
    id: string
    nome: string
    provider: CourseProvider
    lmsCourseId: string | null
  }
}

/**
 * Provisiona o acesso do aluno ao curso na fornecedora correta e dispara os
 * emails de boas-vindas/matricula. NAO mexe em Payment nem em status da
 * matricula — isso fica a cargo do chamador (pagamento vs bolsa).
 *
 * O canal depende de `course.provider`:
 *   - EA  → ensureStudentOnPlatform + linkCourseToStudent (+ email de credenciais)
 *   - LMS → POST /api/v1/enrollments (o LMS provisiona no parceiro por baixo)
 *
 * `idempotencyKey` (id do pagamento ou da matricula) e enviado ao LMS como
 * Idempotency-Key, garantindo que re-entregas do webhook nao re-provisionem.
 *
 * Erros de plataforma NAO ficam invisiveis: notificamos SUPER_ADMIN antes de
 * relancar — no webhook o gateway reentrega; na bolsa a rota responde ao operador.
 */
async function provisionEnrollmentAccess(
  tenant: TenantContext,
  enrollment: EnrollmentForProvision,
  idempotencyKey: string,
): Promise<void> {
  // `created` controla os emails de "primeira vez" (credenciais/matricula):
  // EA => aluno recem-criado na plataforma; LMS => primeiro contato do aluno
  // com o LMS (lmsStudentId ainda nulo). `school` carrega as credenciais da
  // plataforma de aulas (EA ou LMS) para o email de matricula — em memoria,
  // texto puro, nunca logado nem persistido em claro.
  const provisioned =
    enrollment.course.provider === "LMS"
      ? await provisionLmsAccess(tenant, enrollment, idempotencyKey)
      : await provisionEaAccess(enrollment)
  const created = provisioned.created
  const school = provisioned.school

  // Gera credenciais do painel /aluno quando o aluno ainda não tem senha.
  // Vale tanto na 1ª compra (created=true) quanto em alunos antigos que nunca
  // logaram (passwordHash=null) — assim qualquer matricula garante acesso ao painel.
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

  // Marca da unidade para os emails ao aluno. Venda de revenda usa a identidade
  // da loja (logo, nome, domínio, reply-to) — nunca os dados da PMB. Carregada
  // uma única vez (só quando há email a enviar) e reusada nos dois envios abaixo.
  // Sempre que houver email enviamos pelo menos o e-mail de curso (matrícula
  // nova ou "novo curso liberado" em recompra) — então a marca da unidade
  // precisa ser carregada sempre que houver email.
  const willSendStudentEmail = !!enrollment.student.email
  const emailBrand = !willSendStudentEmail
    ? PMB_EMAIL_BRAND
    : tenant.isPmbVitrine
      ? PMB_EMAIL_BRAND
      : await loadTenantEmailBrand(tenant.id)
  const storeBase = (emailBrand.siteUrl ?? resolveAppUrl()).replace(/\/$/, "")
  const emailFrom = emailFromForBrand(emailBrand)
  const emailReplyTo = emailBrand.replyTo ?? undefined

  // Emails ao aluno em background (após a resposta): não bloqueiam o webhook de
  // pagamento (que já respondeu 200) nem são cortados pelo congelamento da
  // instância serverless. Best-effort — cada envio trata o próprio erro.
  const studentEmail = enrollment.student.email
  const emailTenantId = tenant.isPmbVitrine ? null : tenant.id
  if (studentEmail) {
    afterResponse(async () => {
      // Email de boas-vindas ao painel /aluno (com senha temporária).
      if (panelPassword) {
        try {
          await sendEmail({
            to: studentEmail,
            from: emailFrom,
            replyTo: emailReplyTo,
            tenantId: emailTenantId,
            subject: `Bem-vindo! Seu acesso ao painel ${emailBrand.name}`,
            template: {
              type: "student-welcome",
              props: {
                studentName: enrollment.student.nome,
                studentEmail,
                temporaryPassword: panelPassword,
                loginUrl: `${storeBase}/login`,
                brand: emailBrand,
              },
            },
          })
        } catch (err) {
          contextLogger().error(
            { err, event: "fulfill.student_welcome_email_failed", studentId: enrollment.student.id },
            "student-welcome email falhou",
          )
        }
      }

      // Envia em TODA primeira cobrança da matrícula (este bloco só roda na 1ª
      // cobrança de cada matrícula — parcelas seguintes caem em outro ramo). Assim
      // o ALUNO ANTIGO que compra um curso NOVO também é avisado. `created` (1º
      // contato com a plataforma de aulas) só varia a copy/assunto.
      // Link sempre aponta para a área do aluno DENTRO do nosso sistema
      // (vitrine do revendedor ou app PMB). Mantém o white-label.
      try {
        await sendEmail({
          to: studentEmail,
          from: emailFrom,
          replyTo: emailReplyTo,
          tenantId: emailTenantId,
          subject: created
            ? `Matrícula confirmada em ${enrollment.course.nome}`
            : `Novo curso liberado: ${enrollment.course.nome}`,
          template: {
            type: "enrollment",
            props: {
              studentName: enrollment.student.nome,
              studentEmail,
              courseName: enrollment.course.nome,
              studentPanelUrl: `${storeBase}/aluno`,
              isNewStudent: created,
              // Credenciais da plataforma de aulas (EA ou LMS) — quando ausentes,
              // o template orienta o acesso pela area do aluno.
              school,
              brand: emailBrand,
            },
          },
        })
      } catch (err) {
        contextLogger().error(
          { err, event: "fulfill.enrollment_email_failed", enrollmentId: enrollment.id, studentId: enrollment.student.id },
          "enrollment email falhou",
        )
      }
    })
  }
}

/**
 * Provisiona o curso EA: garante o aluno na plataforma, vincula o curso e (se
 * o aluno foi criado agora) envia o email de credenciais. Retorna `created` e
 * as credenciais da plataforma de aulas (`school`) para o email de matricula —
 * a senha em texto puro só vem na 1ª criação (`plataformaSenha`); em recompra
 * fica null (o aluno usa a que já recebeu).
 */
async function provisionEaAccess(
  enrollment: EnrollmentForProvision,
): Promise<{ created: boolean; school: EnrollmentSchoolAccess | null }> {
  let plataformaAlunoId: number
  let created: boolean
  let plataformaSenha: string | null
  try {
    const ensured = await ensureStudentOnPlatform(enrollment.student.id)
    plataformaAlunoId = ensured.plataformaAlunoId
    created = ensured.created
    plataformaSenha = ensured.plataformaSenha
    await linkCourseToStudent(enrollment.student.id, enrollment.course.id)
  } catch (err) {
    contextLogger().error(
      {
        err,
        event: "fulfill.platform_link_failed",
        enrollmentId: enrollment.id,
        studentId: enrollment.student.id,
        courseId: enrollment.course.id,
      },
      "matricula na plataforma de aulas falhou — alertando admin",
    )
    await createNotification({
      audience: "ROLE",
      roleTarget: "SUPER_ADMIN",
      level: "ERROR",
      title: "Matricula na plataforma falhou",
      body: `Aluno ${enrollment.student.nome} / ${enrollment.course.nome}: a plataforma de aulas rejeitou a integracao. Erro: ${err instanceof Error ? err.message : "desconhecido"}`,
      category: "fulfillment",
      href: `/admin/alunos/${enrollment.student.id}`,
    }).catch(swallow("fulfill.notify_admin"))
    throw err
  }

  // Email de credenciais da plataforma somente quando criamos o aluno agora
  // (evita spam em recompras / re-matriculas).
  if (created) {
    try {
      await enviarEmailCredenciais(plataformaAlunoId)
    } catch (err) {
      contextLogger().error(
        { err, event: "fulfill.plataforma_email_failed", plataformaAlunoId, studentId: enrollment.student.id },
        "envioemail da plataforma falhou para aluno",
      )
      await createNotification({
        audience: "ROLE",
        roleTarget: "SUPER_ADMIN",
        level: "WARNING",
        title: "Email de credenciais da plataforma falhou",
        body: `Aluno ${enrollment.student.nome} foi matriculado mas o email com login/senha da plataforma nao foi enviado. Reenvie manualmente.`,
        category: "fulfillment",
        href: `/admin/alunos/${enrollment.student.id}`,
      }).catch(swallow("fulfill.notify_credentials"))
    }
  }

  // Credenciais da plataforma de aulas EA para o email de matricula. O login
  // (ea_aluno_id) sempre existe; a senha em texto puro só na 1ª criação — em
  // recompra `plataformaSenha` é null e o template orienta usar a já recebida.
  const school: EnrollmentSchoolAccess = {
    login: String(plataformaAlunoId),
    password: plataformaSenha,
    loginUrl: getStudentPlatformLoginUrl(),
  }

  return { created, school }
}

/**
 * Provisiona o curso LMS: POST /api/v1/enrollments (o LMS provisiona no parceiro
 * por baixo). Idempotente via Idempotency-Key. Persiste lmsEnrollmentId na
 * matricula (e lmsStudentId no aluno, se retornado). Retorna `created` (true se
 * era o primeiro contato do aluno com o LMS).
 *
 * Falha parcial (201 + provisioning.ok=false): alerta SUPER_ADMIN e SEGUE — o
 * espelho local foi criado e um retry posterior reprovisiona (idempotente). NAO
 * relanca (evita reentrega/duplicacao do webhook). Falha de rede/HTTP: relanca.
 */
async function provisionLmsAccess(
  tenant: TenantContext,
  enrollment: EnrollmentForProvision,
  idempotencyKey: string,
): Promise<{ created: boolean; school: EnrollmentSchoolAccess | null }> {
  if (!enrollment.course.lmsCourseId) {
    await notifyLmsProvisionError(
      enrollment,
      `Curso "${enrollment.course.nome}" sem lmsCourseId — rode o sync do catálogo LMS antes de vender.`,
    )
    throw new Error(`curso LMS ${enrollment.course.id} sem lmsCourseId`)
  }
  if (!enrollment.student.email) {
    await notifyLmsProvisionError(
      enrollment,
      `Aluno ${enrollment.student.nome} sem email — o LMS exige email para matricular.`,
    )
    throw new Error(`aluno ${enrollment.student.id} sem email (LMS)`)
  }

  const wasNew = !enrollment.student.lmsStudentId
  const tenantExternalId = tenant.isPmbVitrine ? undefined : tenant.id

  let res: LmsEnrollmentResponse
  try {
    res = await createLmsEnrollment(
      {
        studentExternalId: enrollment.student.id,
        student: { name: enrollment.student.nome, email: enrollment.student.email },
        courseId: enrollment.course.lmsCourseId,
        tenantExternalId,
      },
      idempotencyKey,
    )
  } catch (err) {
    contextLogger().error(
      {
        err,
        event: "fulfill.lms_enrollment_failed",
        enrollmentId: enrollment.id,
        studentId: enrollment.student.id,
        courseId: enrollment.course.id,
      },
      "matricula no LMS falhou — alertando admin",
    )
    await notifyLmsProvisionError(
      enrollment,
      `O LMS rejeitou a matrícula. Erro: ${err instanceof Error ? err.message : "desconhecido"}`,
    )
    throw err
  }

  // Credencial de acesso a plataforma de destino (curso proprio do LMS ou
  // parceiro). Vem so na 1a provisao bem-sucedida; em re-entrega idempotente o
  // LMS reemite o mesmo partnerAccess. Senha CIFRADA em repouso, nunca logada.
  // origin/playback sempre persistidos (a area do aluno ramifica SSO vs redirect
  // por playback).
  const lmsAccess = res.partnerAccess
    ? {
        lmsLogin: res.partnerAccess.login,
        lmsSenha: encrypt(res.partnerAccess.password),
        lmsPortalUrl: res.partnerAccess.portalUrl,
      }
    : {}

  // Credenciais da plataforma de aulas LMS (parceiro por baixo) para o email de
  // matricula — texto puro em memoria, nunca logado/persistido em claro. Sem
  // partnerAccess (ex.: playback local/SSO), o template orienta acesso via area
  // do aluno. portalUrl vazio vira null (cai no caminho "acesse pela area").
  const school: EnrollmentSchoolAccess | null = res.partnerAccess
    ? {
        login: res.partnerAccess.login,
        password: res.partnerAccess.password,
        loginUrl: res.partnerAccess.portalUrl || null,
      }
    : null

  await prisma.$transaction([
    prisma.enrollment.update({
      where: { id: enrollment.id },
      data: {
        lmsEnrollmentId: res.enrollmentId,
        lmsOrigin: res.origin,
        lmsPlayback: res.playback,
        ...lmsAccess,
      },
    }),
    ...(res.studentId
      ? [
          prisma.student.update({
            where: { id: enrollment.student.id },
            data: { lmsStudentId: res.studentId },
          }),
        ]
      : []),
  ])

  // Falha parcial no parceiro por baixo (LMS aceitou, EA falhou): alerta e segue.
  if (!res.provisioning?.ok) {
    contextLogger().warn(
      {
        event: "fulfill.lms_partner_provision_failed",
        enrollmentId: enrollment.id,
        studentId: enrollment.student.id,
        lmsEnrollmentId: res.enrollmentId,
        provisioning: res.provisioning,
      },
      "LMS aceitou a matrícula mas o parceiro por baixo falhou — alertando admin",
    )
    await createNotification({
      audience: "ROLE",
      roleTarget: "SUPER_ADMIN",
      level: "WARNING",
      title: "Provisionamento parcial no LMS",
      body: `Aluno ${enrollment.student.nome} / ${enrollment.course.nome}: o LMS registrou a matrícula mas o parceiro por baixo falhou (${res.provisioning?.message ?? "sem detalhe"}). Um novo sync/retry reprovisiona automaticamente.`,
      category: "fulfillment",
      href: `/admin/alunos/${enrollment.student.id}`,
    }).catch(swallow("fulfill.notify_lms_partial"))
  }

  return { created: wasNew, school }
}

async function notifyLmsProvisionError(
  enrollment: EnrollmentForProvision,
  message: string,
): Promise<void> {
  await createNotification({
    audience: "ROLE",
    roleTarget: "SUPER_ADMIN",
    level: "ERROR",
    title: "Matrícula no LMS falhou",
    body: `${message} (matrícula ${enrollment.id})`,
    category: "fulfillment",
    href: `/admin/alunos/${enrollment.student.id}`,
  }).catch(swallow("fulfill.notify_lms_error"))
}

/**
 * Provisiona UM curso para um aluno na fornecedora correta — usado para os
 * cursos satelite de um pacote (cada item roteia independentemente, suportando
 * pacotes com cursos de AMBAS as fornecedoras). Retorna o lmsEnrollmentId
 * quando provider=LMS (para gravar na matricula satelite), null para EA.
 *
 * EA: garante o aluno (idempotente) + vincula o curso. LMS: POST /enrollments.
 */
async function provisionCourseForStudent(
  tenant: TenantContext,
  student: { id: string; nome: string; email: string | null },
  course: { id: string; nome: string; provider: CourseProvider; lmsCourseId: string | null },
  idempotencyKey: string,
): Promise<{
  lmsEnrollmentId: string | null
  lmsOrigin: string | null
  lmsPlayback: string | null
  lmsLogin: string | null
  lmsSenha: string | null
  lmsPortalUrl: string | null
}> {
  if (course.provider === "LMS") {
    if (!course.lmsCourseId) throw new Error(`curso LMS ${course.id} sem lmsCourseId`)
    if (!student.email) throw new Error(`aluno ${student.id} sem email (LMS)`)
    const res = await createLmsEnrollment(
      {
        studentExternalId: student.id,
        student: { name: student.nome, email: student.email },
        courseId: course.lmsCourseId,
        tenantExternalId: tenant.isPmbVitrine ? undefined : tenant.id,
      },
      idempotencyKey,
    )
    // Falha parcial (201 + provisioning.ok=false): o espelho local foi criado,
    // mas o parceiro por baixo falhou. Mesma politica do curso primario (alerta
    // e segue), porem aqui via log — o caller (provisionPackageSiblings) ja
    // alerta o SUPER_ADMIN apenas quando ha throw.
    if (!res.provisioning?.ok) {
      contextLogger().warn(
        {
          event: "fulfill.lms_sibling_partial",
          studentId: student.id,
          courseId: course.id,
          lmsEnrollmentId: res.enrollmentId,
          provisioning: res.provisioning,
        },
        "curso de pacote LMS: parceiro por baixo falhou (sera reprovisionado por retry/sync)",
      )
    }
    return {
      lmsEnrollmentId: res.enrollmentId,
      lmsOrigin: res.origin,
      lmsPlayback: res.playback,
      lmsLogin: res.partnerAccess?.login ?? null,
      lmsSenha: res.partnerAccess ? encrypt(res.partnerAccess.password) : null,
      lmsPortalUrl: res.partnerAccess?.portalUrl ?? null,
    }
  }

  // EA: ensure (idempotente — no-op se o aluno ja existe) + vincula o curso.
  // O ensure cobre o caso de pacote misto cujo curso primario era LMS (e portanto
  // o aluno ainda nao existia na EA).
  await ensureStudentOnPlatform(student.id)
  await linkCourseToStudent(student.id, course.id)
  return {
    lmsEnrollmentId: null,
    lmsOrigin: null,
    lmsPlayback: null,
    lmsLogin: null,
    lmsSenha: null,
    lmsPortalUrl: null,
  }
}

/**
 * Motivo pelo qual a matricula e liberada sem passar por gateway. Muda apenas
 * os textos das notificacoes — o provisionamento e identico.
 *
 * - `SCHOLARSHIP`: bolsa concedida na venda direta (flag `Student.bolsista`).
 * - `FULL_DISCOUNT`: cupom/desconto zerou o valor (ex.: cupom de 100%). Nao ha
 *   o que cobrar, entao a venda e liberada como se fosse bolsa.
 */
export type FreeEnrollmentReason = "SCHOLARSHIP" | "FULL_DISCOUNT"

/**
 * Libera a matricula SEM cobranca: cria o aluno na plataforma, vincula o curso
 * e dispara os emails — SEM chamada a gateway e SEM registro de Payment. Marca
 * a matricula como ACTIVE imediatamente.
 *
 * Usada em dois casos (ver `FreeEnrollmentReason`): bolsa de estudo na venda
 * direta e valor zerado por desconto integral em qualquer canal de checkout.
 * Chamada de forma SINCRONA.
 *
 * CONCORRENCIA: `startedAt` sozinho e um le-depois-escreve, e com o cupom de
 * 100% esta funcao passou a ser alcancavel por rota PUBLICA (duplo clique em
 * "Concluir matricula", retry do cliente, webhook + retorno sincrono). Duas
 * chamadas simultaneas passariam as duas pelo guard e provisionariam o aluno
 * DUAS VEZES na plataforma de aulas. Por isso o mesmo advisory lock do fluxo
 * pago, aqui chaveado pela matricula. Perder o lock e no-op: quem o detem esta
 * fazendo exatamente este trabalho.
 */
export async function fulfillScholarshipEnrollment(
  tenant: TenantContext,
  enrollmentId: string,
  opts?: { reason?: FreeEnrollmentReason },
): Promise<void> {
  const ran = await withAdvisoryLock(
    advisoryLockKeyFrom(`FREE_ENROLLMENT:${enrollmentId}`),
    () => fulfillScholarshipEnrollmentLocked(tenant, enrollmentId, opts),
  )
  if (ran) return

  // Lock ocupado: outro processo esta liberando esta mesma matricula. NAO
  // podemos simplesmente retornar — quem chama trataria como sucesso e diria ao
  // aluno que o curso foi liberado sem que nada tenha sido provisionado (o
  // outro processo ainda pode falhar). Conferimos o estado real: so e sucesso
  // se a matricula ja estiver provisionada.
  const current = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: { startedAt: true },
  })
  if (current?.startedAt) {
    contextLogger().info(
      { event: "fulfill.scholarship.lock_busy_already_done", enrollmentId },
      "matricula ja provisionada por outro processo — no-op",
    )
    return
  }
  contextLogger().warn(
    { event: "fulfill.scholarship.lock_busy", enrollmentId },
    "outro processo esta liberando esta matricula e ela ainda nao esta ativa",
  )
  throw new Error(
    `liberacao da matricula ${enrollmentId} ja esta em andamento em outro processo`,
  )
}

async function fulfillScholarshipEnrollmentLocked(
  tenant: TenantContext,
  enrollmentId: string,
  opts?: { reason?: FreeEnrollmentReason },
): Promise<void> {
  const reason: FreeEnrollmentReason = opts?.reason ?? "SCHOLARSHIP"
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      student: {
        select: { id: true, email: true, nome: true, passwordHash: true, lmsStudentId: true },
      },
      course: {
        select: { id: true, nome: true, provider: true, lmsCourseId: true },
      },
      coursePackage: { select: { name: true } },
    },
  })
  if (!enrollment) throw new Error(`enrollment ${enrollmentId} nao encontrado`)
  if (enrollment.startedAt) return // ja provisionada

  // Bolsa nao tem pagamento — Idempotency-Key do LMS = id da matricula.
  await provisionEnrollmentAccess(tenant, enrollment, enrollment.id)

  // Mesmo prazo de permanência (12 meses) das matrículas pagas.
  const accessStartedAt = new Date()
  const accessExpiresAt = addMonthsClamped(accessStartedAt, STUDENT_ACCESS_MONTHS)

  // Bolsa de PACOTE: a matrícula primária liberou o 1º curso acima; agora
  // liberamos os demais cursos do pacote (satélites ACTIVE, finalAmount 0, sem
  // Payment) — mesma rotina best-effort do fluxo pago.
  if (enrollment.coursePackageId) {
    await provisionPackageSiblings(
      tenant,
      enrollment,
      accessStartedAt,
      accessExpiresAt,
    )
  }

  await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: {
      status: "ACTIVE",
      startedAt: accessStartedAt,
      expiresAt: accessExpiresAt,
    },
  })

  // Nome exibido nas notificações: pacote mostra o nome do pacote.
  const purchaseName = enrollment.coursePackage
    ? `pacote ${enrollment.coursePackage.name}`
    : enrollment.course.nome

  const isFullDiscount = reason === "FULL_DISCOUNT"

  await createNotification({
    audience: "STUDENT",
    studentId: enrollment.student.id,
    level: "SUCCESS",
    title: isFullDiscount
      ? `Matrícula liberada — ${purchaseName}`
      : `Bolsa de estudo concedida — ${purchaseName}`,
    body: isFullDiscount
      ? "Seu cupom cobriu 100% do valor. Acesse a área de aulas para começar agora."
      : "Acesse a área de aulas para começar agora — sem nenhuma cobrança.",
    category: "enrollment",
    href: "/aluno/cursos",
    // Email de matrícula dedicado já enviado em provisionEnrollmentAccess.
    suppressEmail: true,
  })

  if (!tenant.isPmbVitrine) {
    await createNotification({
      audience: "TENANT",
      tenantId: tenant.id,
      level: "SUCCESS",
      title: isFullDiscount
        ? `Venda com desconto integral — ${purchaseName}`
        : `Bolsa concedida — ${purchaseName}`,
      body: isFullDiscount
        ? `${enrollment.student.nome} usou cupom de 100% e teve o acesso liberado (sem cobrança).`
        : `${enrollment.student.nome} recebeu bolsa de estudo (sem cobrança).`,
      category: "sale",
      href: "/painel/vendas",
    })
  } else {
    await createNotification({
      audience: "ROLE",
      roleTarget: "SUPER_ADMIN",
      level: "SUCCESS",
      title: isFullDiscount
        ? `Venda com desconto integral — ${purchaseName}`
        : `Bolsa de estudo — ${purchaseName}`,
      body: isFullDiscount
        ? `${enrollment.student.nome} (vitrine PMB) usou cupom de 100% e teve o acesso liberado (sem cobrança).`
        : `${enrollment.student.nome} (vitrine PMB) recebeu bolsa de estudo (sem cobrança).`,
      category: "sale",
      href: "/admin/vendas",
    })
  }
}
