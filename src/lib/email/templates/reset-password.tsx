import { Button, Section, Text } from "@react-email/components"
import { EmailLayout, styles } from "./_layout"

export interface ResetPasswordTemplateProps {
  userName: string
  resetUrl: string
  expirationMinutes: number
}

export function ResetPasswordTemplate({
  userName,
  resetUrl,
  expirationMinutes,
}: ResetPasswordTemplateProps) {
  return (
    <EmailLayout preview="Redefinir sua senha — Profissionaliza Mais Brasil">
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
