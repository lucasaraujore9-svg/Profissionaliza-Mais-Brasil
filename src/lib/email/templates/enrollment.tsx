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

export interface EnrollmentTemplateProps {
  studentName: string
  courseName: string
  plataformaLoginUrl: string
  studentLogin: string
  studentPassword: string
}

export function EnrollmentTemplate({
  studentName,
  courseName,
  plataformaLoginUrl,
  studentLogin,
  studentPassword,
}: EnrollmentTemplateProps) {
  return (
    <Html>
      <Head />
      <Preview>Sua matrícula em {courseName} foi confirmada!</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Parabéns, {studentName}!</Heading>
          <Text style={paragraph}>
            Sua matrícula no curso <strong>{courseName}</strong> foi confirmada.
          </Text>
          <Text style={paragraph}>
            Você já pode acessar a plataforma com os dados abaixo:
          </Text>
          <Section style={credentialsBox}>
            <Text style={credentialLine}>
              <strong>Login:</strong> {studentLogin}
            </Text>
            <Text style={credentialLine}>
              <strong>Senha:</strong> {studentPassword}
            </Text>
          </Section>
          <Section style={{ textAlign: "center" as const, margin: "32px 0" }}>
            <Button style={button} href={plataformaLoginUrl}>
              Acessar Área do Aluno
            </Button>
          </Section>
          <Text style={footer}>
            Recomendamos alterar sua senha no primeiro acesso.
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

const credentialsBox = {
  backgroundColor: "#F3F4F6",
  borderRadius: "8px",
  padding: "16px",
  margin: "16px 0",
}

const credentialLine = {
  color: "#1A1A2E",
  fontSize: "14px",
  fontFamily: "'JetBrains Mono','Courier New',monospace",
  margin: "4px 0",
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

EnrollmentTemplate.PreviewProps = {
  studentName: "Beatriz Souza",
  courseName: "Auxiliar Administrativo",
  plataformaLoginUrl: "https://escola.com/login",
  studentLogin: "beatriz.souza@gmail.com",
  studentPassword: "Curso@2026",
} satisfies EnrollmentTemplateProps

export default EnrollmentTemplate
