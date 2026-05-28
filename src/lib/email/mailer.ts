import { render } from "@react-email/components"
import {
  WelcomeTemplate,
  type WelcomeTemplateProps,
} from "./templates/welcome"
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
import { sendSmtp, getDefaultFrom } from "./smtp"

export class EmailError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = "EmailError"
  }
}

export type EmailTemplate =
  | { type: "welcome"; props: WelcomeTemplateProps }
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

interface SendEmailParams {
  to: string | string[]
  subject: string
  template: EmailTemplate
  from?: string
  replyTo?: string
}

function renderTemplate(template: EmailTemplate): React.ReactElement {
  switch (template.type) {
    case "welcome":
      return WelcomeTemplate(template.props)
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
}: SendEmailParams): Promise<{ id: string }> {
  const element = renderTemplate(template)
  const html = await render(element)

  const provider = pickProvider()

  if (provider === "smtp") {
    try {
      const { messageId } = await sendSmtp({
        to,
        subject,
        html,
        from: from ?? getDefaultFrom(),
        replyTo,
      })
      return { id: messageId }
    } catch (err) {
      throw new EmailError("Falha ao enviar email via SMTP", err)
    }
  }

  // Resend (fallback)
  const { Resend } = await import("resend")
  const client = new Resend(process.env.RESEND_API_KEY!)
  const result = await client.emails.send({
    from:
      from ??
      process.env.SMTP_FROM ??
      "Profissionaliza Mais Brasil <profissionaliza@bmbr.com.br>",
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
  return { id: result.data.id }
}
