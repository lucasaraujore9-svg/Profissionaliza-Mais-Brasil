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

export interface StudentWelcomeTemplateProps {
  studentName: string
  studentEmail: string
  temporaryPassword: string
  loginUrl: string
  storeName: string
}

/**
 * Boas-vindas ao painel do aluno após a primeira compra. Inclui senha
 * temporária para o primeiro acesso. O usuário deve trocar a senha
 * em `Perfil → Alterar senha`.
 */
export function StudentWelcomeTemplate({
  studentName,
  studentEmail,
  temporaryPassword,
  loginUrl,
  storeName,
}: StudentWelcomeTemplateProps) {
  return (
    <Html>
      <Head />
      <Preview>Sua conta em {storeName} está pronta</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Bem-vindo, {studentName.split(" ")[0]}!</Heading>
          <Text style={paragraph}>
            Sua compra em <strong>{storeName}</strong> foi registrada com
            sucesso e você já tem acesso ao seu painel do aluno.
          </Text>
          <Text style={paragraph}>
            No painel você acompanha:
          </Text>
          <Section style={listSection}>
            <Text style={item}>· Seus cursos comprados</Text>
            <Text style={item}>· Faturas em aberto e histórico de pagamentos</Text>
            <Text style={item}>· Recibos e segundas vias</Text>
          </Section>

          <Section style={credBox}>
            <Text style={credLabel}>Seu acesso</Text>
            <Text style={credRow}>
              <strong>Email:</strong>{" "}
              <span style={credValue}>{studentEmail}</span>
            </Text>
            <Text style={credRow}>
              <strong>Senha temporária:</strong>{" "}
              <span style={credValue}>{temporaryPassword}</span>
            </Text>
            <Text style={credHint}>
              Recomendamos que você troque a senha no primeiro acesso, em
              Perfil → Alterar senha.
            </Text>
          </Section>

          <Section style={{ textAlign: "center" as const, margin: "32px 0" }}>
            <Button style={button} href={loginUrl}>
              Acessar meu painel
            </Button>
          </Section>

          <Text style={footer}>
            Se você não fez esta compra, ignore este email.{" "}
            {storeName} · Profissionaliza Mais Brasil
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
  color: "#025918",
  fontSize: "26px",
  fontWeight: "800",
  margin: "0 0 16px",
}

const paragraph = {
  color: "#1A1A2E",
  fontSize: "15px",
  lineHeight: "1.6",
  margin: "0 0 12px",
}

const listSection = {
  margin: "8px 0 16px",
}

const item = {
  color: "#4B5563",
  fontSize: "14px",
  lineHeight: "1.7",
  margin: 0,
}

const credBox = {
  backgroundColor: "#F0FDF4",
  border: "1px solid #BBF7D0",
  borderRadius: "10px",
  padding: "20px",
  margin: "24px 0",
}

const credLabel = {
  color: "#025918",
  fontSize: "12px",
  fontWeight: "800",
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
  margin: "0 0 12px",
}

const credRow = {
  color: "#1A1A2E",
  fontSize: "14px",
  lineHeight: "1.6",
  margin: "0 0 6px",
}

const credValue = {
  fontFamily: "'SF Mono','Monaco',monospace",
  fontSize: "14px",
}

const credHint = {
  color: "#4B5563",
  fontSize: "12px",
  lineHeight: "1.5",
  margin: "12px 0 0",
}

const button = {
  backgroundColor: "#025918",
  borderRadius: "8px",
  color: "#FFFFFF",
  fontSize: "15px",
  fontWeight: "700",
  textDecoration: "none",
  textAlign: "center" as const,
  padding: "12px 28px",
}

const footer = {
  color: "#9CA3AF",
  fontSize: "12px",
  lineHeight: "1.5",
  margin: "24px 0 0",
  textAlign: "center" as const,
}
