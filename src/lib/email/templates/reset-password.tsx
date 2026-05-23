import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components"

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
    <Html>
      <Head />
      <Preview>Redefinir sua senha</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Olá, {userName}</Heading>
          <Text style={paragraph}>
            Recebemos uma solicitação para redefinir sua senha.
          </Text>
          <Text style={paragraph}>
            Clique no botão abaixo para criar uma nova senha. Este link expira em{" "}
            <strong>{expirationMinutes} minutos</strong>.
          </Text>
          <Section style={{ textAlign: "center" as const, margin: "32px 0" }}>
            <Button style={button} href={resetUrl}>
              Redefinir Senha
            </Button>
          </Section>
          <Text style={footer}>
            Se você não solicitou a redefinição, ignore este email.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

const main = {
  backgroundColor: "#FAFAFA",
  fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
}

const container = {
  backgroundColor: "#FFFFFF",
  margin: "0 auto",
  padding: "32px",
  maxWidth: "560px",
  borderRadius: "12px",
}

const h1 = {
  color: "#1A1A2E",
  fontSize: "28px",
  fontWeight: "700",
  margin: "0 0 16px",
}

const paragraph = {
  color: "#1A1A2E",
  fontSize: "16px",
  lineHeight: "1.6",
  margin: "0 0 16px",
}

const button = {
  backgroundColor: "#025918",
  borderRadius: "8px",
  color: "#FFFFFF",
  fontSize: "16px",
  fontWeight: "600",
  textDecoration: "none",
  textAlign: "center" as const,
  padding: "12px 24px",
}

const footer = {
  color: "#9CA3AF",
  fontSize: "12px",
  lineHeight: "1.4",
  margin: "24px 0 0",
  textAlign: "center" as const,
}

ResetPasswordTemplate.PreviewProps = {
  userName: "Carlos Mendes",
  resetUrl: "https://profissionalizamaisbrasil.com.br/auth/reset?token=abc123xyz",
  expirationMinutes: 30,
} satisfies ResetPasswordTemplateProps

export default ResetPasswordTemplate
