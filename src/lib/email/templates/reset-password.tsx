import { Button, Section, Text } from "@react-email/components"
import { EmailLayout, styles } from "./_layout"
import { PMB_EMAIL_BRAND, type EmailBrand } from "../brand"

export interface ResetPasswordTemplateProps {
  userName: string
  resetUrl: string
  expirationMinutes: number
  /** Marca da loja (reset de senha de aluno de revenda). Default: PMB. */
  brand?: EmailBrand
}

export function ResetPasswordTemplate({
  userName,
  resetUrl,
  expirationMinutes,
  brand = PMB_EMAIL_BRAND,
}: ResetPasswordTemplateProps) {
  return (
    <EmailLayout preview={`Redefinir sua senha — ${brand.name}`} brand={brand}>
      <Text style={styles.h1}>Vamos redefinir sua senha</Text>
      <Text style={styles.paragraph}>Olá, {userName}.</Text>
      <Text style={styles.paragraph}>
        Recebemos um pedido para redefinir a senha da sua conta. Clique no botão
        abaixo para criar uma nova senha — o link expira em{" "}
        <strong>{expirationMinutes} minutos</strong>.
      </Text>

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

      <Text style={styles.paragraphMuted}>
        Não foi você que pediu? Ignore este email — sua senha continua a mesma.
      </Text>
    </EmailLayout>
  )
}

ResetPasswordTemplate.PreviewProps = {
  userName: "Carlos Mendes",
  resetUrl: "https://profissionalizamaisbrasil.com.br/reset-password?token=abc123xyz",
  expirationMinutes: 30,
} satisfies ResetPasswordTemplateProps

export default ResetPasswordTemplate
