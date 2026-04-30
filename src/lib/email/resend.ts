import { Resend } from "resend"
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

const DEFAULT_FROM = "Profissionaliza Mais Brasil <noreply@profissionalizamaisbrasil.com.br>"

let resendClient: Resend | null = null

function getResend(): Resend {
  if (resendClient) return resendClient
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new Error("RESEND_API_KEY environment variable is required")
  }
  resendClient = new Resend(apiKey)
  return resendClient
}

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

export async function sendEmail({
  to,
  subject,
  template,
  from = DEFAULT_FROM,
  replyTo,
}: SendEmailParams): Promise<{ id: string }> {
  const client = getResend()
  const element = renderTemplate(template)

  try {
    const result = await client.emails.send({
      from,
      to,
      subject,
      react: element,
      replyTo,
    })

    if (result.error) {
      throw new EmailError(
        `Resend error: ${result.error.message}`,
        result.error,
      )
    }

    if (!result.data?.id) {
      throw new EmailError("Resend did not return an email ID")
    }

    return { id: result.data.id }
  } catch (error) {
    if (error instanceof EmailError) throw error
    throw new EmailError("Failed to send email via Resend", error)
  }
}
