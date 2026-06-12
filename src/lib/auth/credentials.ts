import { randomBytes } from "node:crypto"
import { sendEmail } from "@/lib/email/resend"
import { appUrl } from "@/lib/tenant/urls"
import { emailFromForBrand, type EmailBrand } from "@/lib/email/brand"
import { contextLogger } from "@/lib/logger"

/**
 * Gera uma senha temporária forte e legível (sem caracteres ambíguos).
 * Usada quando o admin opta por criar a conta já com senha definida, em vez
 * de enviar um convite por link. O usuário é obrigado a trocá-la no 1º acesso
 * (mustChangePassword=true).
 */
export function generateTempPassword(): string {
  // Sem 0/O/1/l/I para evitar confusão ao copiar/digitar.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
  const symbols = "!@#$%&*"
  const bytes = randomBytes(12)
  let out = ""
  for (let i = 0; i < 10; i++) {
    out += alphabet[bytes[i] % alphabet.length]
  }
  // Garante ao menos um símbolo e um dígito para robustez.
  out += symbols[bytes[10] % symbols.length]
  out += String(bytes[11] % 10)
  return out
}

export interface SendCredentialsParams {
  userName: string
  userEmail: string
  tempPassword: string
  /** Nome da equipe/contexto, ex: "Equipe PMB" ou o nome da revenda. */
  contextLabel: string
  /** Papel/cargo legível, ex: "Vendas PMB" ou "Consultor". */
  roleLabel?: string
  /** Marca da unidade — em contas de revenda evita exibir a marca PMB. */
  brand?: EmailBrand
}

/**
 * Envia o email com as credenciais geradas. Em dev sem provedor configurado,
 * loga o aviso e não quebra o fluxo — a senha continua disponível na tela de
 * criação (o admin pode repassá-la manualmente).
 */
export async function sendCredentialsEmail(
  params: SendCredentialsParams,
): Promise<boolean> {
  const loginUrl = `${appUrl()}/login`
  try {
    await sendEmail({
      to: params.userEmail,
      subject: `Seu acesso a ${params.contextLabel}`,
      from: params.brand ? emailFromForBrand(params.brand) : undefined,
      replyTo: params.brand?.replyTo ?? undefined,
      template: {
        type: "account-credentials",
        props: {
          userName: params.userName,
          contextLabel: params.contextLabel,
          roleLabel: params.roleLabel,
          loginEmail: params.userEmail,
          tempPassword: params.tempPassword,
          loginUrl,
          brand: params.brand,
        },
      },
    })
    return true
  } catch (err) {
    contextLogger().warn(
      { err, event: "credentials.email_failed", userEmail: params.userEmail },
      "falha ao enviar email de credenciais — senha disponível na tela de criação",
    )
    return false
  }
}
