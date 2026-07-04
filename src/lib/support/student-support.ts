import { prisma } from "@/lib/prisma"
import { createNotification } from "@/lib/notifications"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"
import { sendEmail, isEmailConfigured } from "@/lib/email/resend"
import {
  PMB_EMAIL_BRAND,
  emailFromForBrand,
  tenantEmailBrand,
} from "@/lib/email/brand"
import { appUrl } from "@/lib/tenant/urls"
import { contextLogger } from "@/lib/logger"
import { env } from "@/lib/env"

const PMB_SUPPORT_EMAIL =
  env.PMB_SUPPORT_EMAIL ??
  "atendimento@profissionalizamaisbrasil.com.br"

/**
 * Aluno carregado com o tenant — shape mínimo necessário para rotear o suporte.
 * Use este `select` ao buscar o Student tanto na rota do aluno quanto no webhook
 * do LMS.
 */
export const SUPPORT_STUDENT_SELECT = {
  id: true,
  nome: true,
  email: true,
  fone: true,
  tenantId: true,
  tenant: {
    select: {
      slug: true,
      name: true,
      logoUrl: true,
      customDomain: true,
      domainVerified: true,
      supportEmail: true,
      owner: { select: { email: true, name: true } },
    },
  },
} as const

export interface SupportStudent {
  id: string
  nome: string
  email: string | null
  fone: string | null
  tenantId: string
  tenant: {
    slug: string
    name: string
    logoUrl: string | null
    customDomain: string | null
    domainVerified: boolean | null
    supportEmail: string | null
    owner: { email: string | null; name: string | null } | null
  } | null
}

/**
 * Cria um chamado de suporte de aluno (ContactMessage kind=STUDENT_SUPPORT) e o
 * ROTEIA para a caixa de atendimento correta conforme a unidade do aluno:
 *  - aluno da vitrine-mãe (tenant `__pmb__`)  -> caixa do PMB  (tenantId=null,
 *    notificação ROLE:SUPER_ADMIN, e-mail PMB_SUPPORT_EMAIL).
 *  - aluno de uma revenda                     -> caixa da revenda (tenantId,
 *    notificação TENANT, e-mail do dono da unidade).
 *
 * `source` distingue a origem ("aluno" pela área do aluno do PMB, "lms" pelo
 * webhook do LMS). Persistência + notificação + e-mail são best-effort: falhas
 * são logadas mas não lançam (o caller responde sucesso).
 */
export async function createStudentSupportTicket(input: {
  student: SupportStudent
  assunto: string
  mensagem: string
  source: string
}): Promise<void> {
  const { student, assunto, mensagem, source } = input

  const isPmb = student.tenant?.slug === PMB_TENANT_SLUG
  const title = `Suporte: ${assunto}`
  const notifBody = `${student.nome} (${student.email ?? "sem email"}) enviou:\n\n${mensagem}`

  // 1) Persiste na caixa de atendimento (histórico/auditoria).
  try {
    await prisma.contactMessage.create({
      data: {
        kind: "STUDENT_SUPPORT",
        tenantId: isPmb ? null : student.tenantId,
        studentId: student.id,
        nome: student.nome,
        email: student.email ?? null,
        telefone: student.fone ?? null,
        assunto,
        mensagem,
        source,
      },
    })
  } catch (err) {
    contextLogger().error(
      { err, event: "support.persist_failed", studentId: student.id, source },
      "Falha ao persistir ContactMessage de suporte — segue com notificacao/email",
    )
  }

  // 2) Notificação in-app roteada.
  if (isPmb) {
    await createNotification({
      audience: "ROLE",
      roleTarget: "SUPER_ADMIN",
      title,
      body: notifBody,
      category: "support",
      level: "INFO",
      href: `/admin/alunos/${student.id}`,
    })
  } else if (student.tenantId) {
    await createNotification({
      audience: "TENANT",
      tenantId: student.tenantId,
      title,
      body: notifBody,
      category: "support",
      level: "INFO",
      href: `/painel/alunos/${student.id}`,
    })
  }

  // 3) E-mail (best-effort) ao dono da caixa.
  const recipientEmail = isPmb
    ? PMB_SUPPORT_EMAIL
    : student.tenant?.owner?.email ?? null

  if (recipientEmail && isEmailConfigured() && student.email) {
    const brand =
      isPmb || !student.tenant
        ? PMB_EMAIL_BRAND
        : tenantEmailBrand(student.tenant)
    const studentPanelUrl = isPmb
      ? `${appUrl()}/admin/alunos/${student.id}`
      : `${appUrl()}/painel/alunos/${student.id}`

    try {
      await sendEmail({
        to: recipientEmail,
        from: emailFromForBrand(brand),
        replyTo: student.email,
        subject: `[Suporte] ${assunto} — ${student.nome}`,
        template: {
          type: "student-support",
          props: {
            brand,
            studentName: student.nome,
            studentEmail: student.email,
            studentPhone: student.fone ?? undefined,
            subject: assunto,
            message: mensagem,
            studentPanelUrl,
          },
        },
      })
    } catch (err) {
      contextLogger().warn(
        { err, event: "support.email_failed", studentId: student.id, source },
        "Falha ao enviar email de suporte — notificacao in-app continua valida",
      )
    }
  }
}
