import { render } from "@react-email/components"
import {
  ResetPasswordTemplate,
  type ResetPasswordTemplateProps,
} from "./templates/reset-password"
import {
  EnrollmentTemplate,
  type EnrollmentTemplateProps,
} from "./templates/enrollment"
import {
  PaymentTemplate,
  type PaymentTemplateProps,
} from "./templates/payment"
import {
  LeadConfirmationTemplate,
  type LeadConfirmationTemplateProps,
} from "./templates/lead-confirmation"
import {
  InviteTemplate,
  type InviteTemplateProps,
} from "./templates/invite"
import {
  ResellerOnboardingTemplate,
  type ResellerOnboardingTemplateProps,
} from "./templates/reseller-onboarding"
import {
  StudentWelcomeTemplate,
  type StudentWelcomeTemplateProps,
} from "./templates/student-welcome"
import {
  StudentSupportTemplate,
  type StudentSupportTemplateProps,
} from "./templates/student-support"
import {
  AccessExpiringTemplate,
  type AccessExpiringTemplateProps,
} from "./templates/access-expiring"
import {
  AccountCredentialsTemplate,
  type AccountCredentialsTemplateProps,
} from "./templates/account-credentials"
import {
  ResellerLeadNotificationTemplate,
  type ResellerLeadNotificationTemplateProps,
} from "./templates/reseller-lead-notification"
import {
  NotificationTemplate,
  type NotificationTemplateProps,
} from "./templates/notification"
import {
  PaymentPendingTemplate,
  type PaymentPendingTemplateProps,
} from "./templates/payment-pending"
import {
  PaymentRejectedTemplate,
  type PaymentRejectedTemplateProps,
} from "./templates/payment-rejected"
import {
  PlatformAccessTemplate,
  type PlatformAccessTemplateProps,
} from "./templates/platform-access"
import { sendSmtp, getDefaultFrom } from "./smtp"

export class EmailError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = "EmailError"
  }
}

export type EmailTemplate =
  | { type: "reset-password"; props: ResetPasswordTemplateProps }
  | { type: "enrollment"; props: EnrollmentTemplateProps }
  | { type: "payment"; props: PaymentTemplateProps }
  | { type: "lead-confirmation"; props: LeadConfirmationTemplateProps }
  | { type: "invite"; props: InviteTemplateProps }
  | {
      type: "reseller-onboarding"
      props: ResellerOnboardingTemplateProps
    }
  | { type: "student-welcome"; props: StudentWelcomeTemplateProps }
  | { type: "student-support"; props: StudentSupportTemplateProps }
  | { type: "access-expiring"; props: AccessExpiringTemplateProps }
  | {
      type: "account-credentials"
      props: AccountCredentialsTemplateProps
    }
  | {
      type: "reseller-lead-notification"
      props: ResellerLeadNotificationTemplateProps
    }
  | { type: "notification"; props: NotificationTemplateProps }
  | { type: "payment-pending"; props: PaymentPendingTemplateProps }
  | { type: "payment-rejected"; props: PaymentRejectedTemplateProps }
  | { type: "platform-access"; props: PlatformAccessTemplateProps }

interface SendEmailParams {
  to: string | string[]
  subject: string
  template: EmailTemplate
  from?: string
  replyTo?: string
  /**
   * Unidade que originou o envio — gravado em `EmailLog` para diagnóstico por
   * revenda. Opcional: envios institucionais (PMB) e legados passam `undefined`.
   */
  tenantId?: string | null
}

/**
 * Limite do que vai para `EmailLog.error`. A coluna é `Text`, mas uma cadeia de
 * `cause` pode arrastar stack e corpo de resposta inteiros — o valor de
 * diagnóstico está nos primeiros caracteres.
 */
const MAX_LOGGED_ERROR = 2000

/** Profundidade máxima da cadeia de `cause` percorrida. */
const MAX_CAUSE_DEPTH = 5

/**
 * Campos que o nodemailer pendura no erro e que o `message` não carrega. São
 * eles que separam senha inválida (`EAUTH` / 535) de timeout (`ETIMEDOUT`) ou
 * recusa do destinatário (`EENVELOPE`) — sem eles, "Falha ao enviar" é a mesma
 * linha para causas que pedem ações opostas.
 */
function providerDetails(value: object): string {
  const { code, responseCode, command } = value as {
    code?: unknown
    responseCode?: unknown
    command?: unknown
  }
  const parts = [
    typeof code === "string" ? code : null,
    typeof responseCode === "number" ? String(responseCode) : null,
    typeof command === "string" ? command : null,
  ].filter((part): part is string => Boolean(part))
  return parts.length > 0 ? ` (${parts.join(", ")})` : ""
}

/** Mensagem legível de um elo da cadeia, ou `null` se não houver uma. */
function messageOf(value: unknown): string | null {
  if (value instanceof Error) return value.message
  if (typeof value === "string") return value
  if (typeof value === "object" && value !== null) {
    const { message } = value as { message?: unknown }
    if (typeof message === "string") return message
    try {
      return JSON.stringify(value)
    } catch {
      return null
    }
  }
  if (value === null || value === undefined) return null
  return String(value)
}

/**
 * Achata um erro e sua cadeia de `cause` numa linha só, para `EmailLog.error`.
 *
 * Por que existe: `sendEmail` embrulha a falha do provedor num `EmailError`
 * genérico ("Falha ao enviar email via SMTP") e a resposta real do servidor
 * fica só no `cause`. Gravar apenas `err.message` foi o que transformou o
 * apagão de 24/08/2026 — a senha da caixa `nao-responda` trocada, SMTP
 * respondendo `535 5.7.8 authentication failed` — em 63 linhas de log
 * idênticas e mudas: o diagnóstico teve que ser refeito reproduzindo o envio
 * à mão. A causa é a única parte acionável, então ela precisa ser PERSISTIDA,
 * não só lançada.
 */
export function describeEmailError(error: unknown): string | null {
  const chain: string[] = []
  const seen = new Set<unknown>()
  let current: unknown = error

  while (current !== null && current !== undefined && chain.length < MAX_CAUSE_DEPTH) {
    if (typeof current === "object") {
      // Cadeia cíclica (`a.cause = b; b.cause = a`) travaria o laço.
      if (seen.has(current)) break
      seen.add(current)
    }

    const message = messageOf(current)
    if (message === null) break

    const details =
      typeof current === "object" && current !== null ? providerDetails(current) : ""
    chain.push(`${message}${details}`)

    current =
      typeof current === "object" && current !== null
        ? (current as { cause?: unknown }).cause
        : undefined
  }

  if (chain.length === 0) return null
  const text = chain.join(" | causa: ")
  return text.length > MAX_LOGGED_ERROR ? `${text.slice(0, MAX_LOGGED_ERROR)}…` : text
}

/**
 * Registra a tentativa de envio em `EmailLog` (best-effort). NUNCA lança: uma
 * falha de log não pode derrubar o envio nem mascarar o erro real do provedor.
 * Prisma é importado dinamicamente para manter o mailer leve e utilizável em
 * previews de template (`email dev`), que não tocam o banco.
 */
async function logEmailAttempt(entry: {
  status: "SENT" | "FAILED"
  to: string | string[]
  subject: string
  template: string
  provider: string
  tenantId?: string | null
  error?: unknown
}): Promise<void> {
  try {
    const { prisma } = await import("@/lib/prisma")
    await prisma.emailLog.create({
      data: {
        to: Array.isArray(entry.to) ? entry.to.join(", ") : entry.to,
        subject: entry.subject,
        template: entry.template,
        status: entry.status,
        provider: entry.provider,
        error: describeEmailError(entry.error),
        tenantId: entry.tenantId ?? null,
      },
    })
  } catch {
    // Log do log falhou — ignora de propósito (best-effort).
  }
}

function renderTemplate(template: EmailTemplate): React.ReactElement {
  switch (template.type) {
    case "reset-password":
      return ResetPasswordTemplate(template.props)
    case "enrollment":
      return EnrollmentTemplate(template.props)
    case "payment":
      return PaymentTemplate(template.props)
    case "lead-confirmation":
      return LeadConfirmationTemplate(template.props)
    case "invite":
      return InviteTemplate(template.props)
    case "reseller-onboarding":
      return ResellerOnboardingTemplate(template.props)
    case "student-welcome":
      return StudentWelcomeTemplate(template.props)
    case "student-support":
      return StudentSupportTemplate(template.props)
    case "access-expiring":
      return AccessExpiringTemplate(template.props)
    case "account-credentials":
      return AccountCredentialsTemplate(template.props)
    case "reseller-lead-notification":
      return ResellerLeadNotificationTemplate(template.props)
    case "notification":
      return NotificationTemplate(template.props)
    case "payment-pending":
      return PaymentPendingTemplate(template.props)
    case "payment-rejected":
      return PaymentRejectedTemplate(template.props)
    case "platform-access":
      return PlatformAccessTemplate(template.props)
  }
}

/**
 * Render a template as HTML (useful for previews).
 */
export async function renderTemplateHtml(
  template: EmailTemplate,
): Promise<string> {
  const element = renderTemplate(template)
  return render(element)
}

/**
 * Detecta qual provedor de email está configurado.
 *
 * - SMTP (Hostinger): se SMTP_HOST + SMTP_USER + SMTP_PASSWORD + SMTP_PORT
 *   estiverem todos definidos.
 * - Resend: se RESEND_API_KEY existir. (Mantido como fallback.)
 *
 * Em produção exige um dos dois — sem isso, `sendEmail` lança EmailError.
 */
function pickProvider(): "smtp" | "resend" {
  const hasSmtp =
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASSWORD &&
    process.env.SMTP_PORT
  if (hasSmtp) return "smtp"
  if (process.env.RESEND_API_KEY) return "resend"
  throw new EmailError(
    "Nenhum provedor de email configurado (defina SMTP_* ou RESEND_API_KEY)",
  )
}

/**
 * Retorna `true` se SMTP ou Resend estão configurados. Útil para call sites
 * que precisam expor "email funciona?" no response sem disparar envio real.
 */
export function isEmailConfigured(): boolean {
  try {
    pickProvider()
    return true
  } catch {
    return false
  }
}

export async function sendEmail({
  to,
  subject,
  template,
  from,
  replyTo,
  tenantId,
}: SendEmailParams): Promise<{ id: string }> {
  const element = renderTemplate(template)
  const html = await render(element)

  // `provider` começa "unknown" para que mesmo a falha de pickProvider() (nenhum
  // provedor configurado — a causa raiz do apagão de email em produção) seja
  // gravada em EmailLog, e não só lançada às cegas.
  let provider = "unknown"
  try {
    provider = pickProvider()

    let id: string
    if (provider === "smtp") {
      try {
        const { messageId } = await sendSmtp({
          to,
          subject,
          html,
          from: from ?? getDefaultFrom(),
          replyTo,
        })
        id = messageId
      } catch (err) {
        throw new EmailError("Falha ao enviar email via SMTP", err)
      }
    } else {
      // Resend (fallback)
      const { Resend } = await import("resend")
      const client = new Resend(process.env.RESEND_API_KEY!)
      const result = await client.emails.send({
        from:
          from ??
          process.env.SMTP_FROM ??
          "Profissionaliza Mais Brasil <nao-responda@profissionalizamaisbrasil.com.br>",
        to,
        subject,
        html,
        replyTo,
      })
      if (result.error) {
        throw new EmailError(`Resend error: ${result.error.message}`, result.error)
      }
      if (!result.data?.id) {
        throw new EmailError("Resend did not return an email ID")
      }
      id = result.data.id
    }

    await logEmailAttempt({
      status: "SENT",
      to,
      subject,
      template: template.type,
      provider,
      tenantId,
    })
    return { id }
  } catch (err) {
    await logEmailAttempt({
      status: "FAILED",
      to,
      subject,
      template: template.type,
      provider,
      tenantId,
      error: err,
    })
    throw err
  }
}
