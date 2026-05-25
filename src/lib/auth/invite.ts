import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email/resend"
import { generateResetToken } from "@/lib/auth/reset-token"
import { contextLogger } from "@/lib/logger"

const INVITE_EXPIRATION_DAYS = 7

export async function createInviteToken(userId: string): Promise<string> {
  const { plain, hash } = generateResetToken()
  const expires = new Date(Date.now() + INVITE_EXPIRATION_DAYS * 24 * 60 * 60 * 1000)
  await prisma.user.update({
    where: { id: userId },
    data: { resetToken: hash, resetTokenExpires: expires },
  })
  return plain
}

export function buildInviteUrl(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://profissionalizamaisbrasil.com.br"
  return `${base}/reset-password?token=${token}&invite=1`
}

export interface SendInviteParams {
  userId: string
  userName: string
  userEmail: string
  inviterName: string
  role: string
  context?: "pmb_team" | "reseller_consultant"
  tenantName?: string
}

export async function sendInvite(params: SendInviteParams): Promise<void> {
  const token = await createInviteToken(params.userId)
  const inviteUrl = buildInviteUrl(token)

  try {
    await sendEmail({
      to: params.userEmail,
      subject: `Convite para ${params.context === "reseller_consultant" ? params.tenantName ?? "equipe" : "equipe PMB"}`,
      template: {
        type: "invite",
        props: {
          userName: params.userName,
          inviterName: params.inviterName,
          role: params.role,
          inviteUrl,
          expirationDays: INVITE_EXPIRATION_DAYS,
          context: params.context,
          tenantName: params.tenantName,
        },
      },
    })
  } catch (err) {
    // Em dev sem RESEND_API_KEY nao quebra o fluxo — loga o link manual
    contextLogger().warn(
      { err, event: "invite.email_failed", inviteUrl },
      "falha ao enviar email de convite — link manual disponível no log",
    )
  }
}
