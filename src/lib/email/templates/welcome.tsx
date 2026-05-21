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

export interface WelcomeTemplateProps {
  resellerName: string
  loginUrl: string
  panelUrl: string
}

export function WelcomeTemplate({
  resellerName,
  loginUrl,
  panelUrl,
}: WelcomeTemplateProps) {
  return (
    <Html>
      <Head />
      <Preview>Bem-vindo ao Profissionaliza Mais Brasil!</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Bem-vindo, {resellerName}!</Heading>
          <Text style={paragraph}>
            Sua conta no Profissionaliza Mais Brasil foi criada com sucesso.
          </Text>
          <Text style={paragraph}>Próximos passos:</Text>
          <Section style={stepsSection}>
            <Text style={step}>1. Acesse seu painel para configurar sua vitrine</Text>
            <Text style={step}>2. Conecte sua conta Mercado Pago</Text>
            <Text style={step}>3. Escolha e personalize seus cursos</Text>
            <Text style={step}>4. Compartilhe sua vitrine com seus clientes</Text>
          </Section>
          <Section style={{ textAlign: "center" as const, margin: "32px 0" }}>
            <Button style={button} href={panelUrl}>
              Acessar Meu Painel
            </Button>
          </Section>
          <Text style={footer}>
            Se precisar de ajuda, responda este email ou acesse {loginUrl}
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

const stepsSection = {
  margin: "16px 0",
}

const step = {
  color: "#6B7280",
  fontSize: "14px",
  lineHeight: "1.6",
  margin: "0 0 8px",
}

const button = {
  backgroundColor: "#3B82F6",
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

WelcomeTemplate.PreviewProps = {
  resellerName: "Maria Silva",
  loginUrl: "https://profissionalizamaisbrasil.com.br/auth/login",
  panelUrl: "https://profissionalizamaisbrasil.com.br/painel",
} satisfies WelcomeTemplateProps

export default WelcomeTemplate
