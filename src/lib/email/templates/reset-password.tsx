import { Button, Section, Text } from "@react-email/components"
import { EmailLayout, styles } from "./_layout"
import { PMB_EMAIL_BRAND, type EmailBrand } from "../brand"

export interface ResetPasswordTemplateProps {
  userName: string
  resetUrl: string
  expirationMinutes: number
  /** Marca da loja (reset de senha de aluno de revenda). Default: PMB. */
  brand?: EmailBrand
  /**
   * Link enviado SEM a pessoa ter pedido — recuperação do e-mail de acesso que
   * não chegou (apagão de 25–28/09/2026). "Recebemos um pedido" seria falso.
   */
  recovery?: boolean
}

/** "5 minutos" / "72 horas": validade longa em minutos não se lê. */
export function expirationLabel(minutes: number): string {
  return minutes >= 120 ? `${Math.round(minutes / 60)} horas` : `${minutes} minutos`
}

export function ResetPasswordTemplate({
  userName,
  resetUrl,
  expirationMinutes,
  brand = PMB_EMAIL_BRAND,
  recovery = false,
}: ResetPasswordTemplateProps) {
  return (
    <EmailLayout preview={`Redefinir sua senha — ${brand.name}`} brand={brand}>
      <Text style={styles.h1}>
        {recovery ? "Crie sua senha de acesso" : "Vamos redefinir sua senha"}
      </Text>
      <Text style={styles.paragraph}>Olá, {userName}.</Text>
      {recovery ? (
        <Text style={styles.paragraph}>
          Seu acesso à área do aluno está pronto, mas o e-mail com a sua senha
          não chegou até você por uma falha no nosso envio. Clique no botão
          abaixo para criar sua senha — o link vale por{" "}
          <strong>{expirationLabel(expirationMinutes)}</strong>.
        </Text>
      ) : (
        <Text style={styles.paragraph}>
          Recebemos um pedido para redefinir a senha da sua conta. Clique no botão
          abaixo para criar uma nova senha — o link expira em{" "}
          <strong>{expirationLabel(expirationMinutes)}</strong>.
        </Text>
      )}

      <Section style={styles.buttonRow}>
        <Button style={styles.primaryButton} href={resetUrl}>
          Criar nova senha
        </Button>
      </Section>

      <Text style={styles.paragraphMuted}>
        Se o botão não funcionar, copie e cole este link no navegador:{" "}
        <a href={resetUrl} style={styles.link}>
          {resetUrl}
        </a>
      </Text>

      {!recovery && (
        <Text style={styles.paragraphMuted}>
          Não foi você que pediu? Ignore este email — sua senha continua a mesma.
        </Text>
      )}
    </EmailLayout>
  )
}

ResetPasswordTemplate.PreviewProps = {
  userName: "Carlos Mendes",
  resetUrl: "https://profissionalizamaisbrasil.com.br/reset-password?token=abc123xyz",
  expirationMinutes: 30,
} satisfies ResetPasswordTemplateProps

export default ResetPasswordTemplate
