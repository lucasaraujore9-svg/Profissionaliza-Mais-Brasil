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

export interface InviteTemplateProps {
  userName: string
  inviterName: string
  role: string
  inviteUrl: string
  expirationDays: number
  context?: "pmb_team" | "reseller_consultant"
  tenantName?: string
}

const roleLabel: Record<string, string> = {
  SUPER_ADMIN: "Super Administrador",
  PMB_SALES: "Equipe de Vendas PMB",
  PMB_RESELLER_MGR: "Gerente de Revendedores",
  consultant: "Consultor",
}

export function InviteTemplate({
  userName,
  inviterName,
  role,
  inviteUrl,
  expirationDays,
  context = "pmb_team",
  tenantName,
}: InviteTemplateProps) {
  const label = roleLabel[role] ?? role
  const headline =
    context === "reseller_consultant" && tenantName
      ? `Bem-vindo(a) a ${tenantName}`
      : "Bem-vindo(a) ao Profissionaliza Mais Brasil"

  return (
    <Html>
      <Head />
      <Preview>{`${inviterName} convidou você para fazer parte da equipe`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{headline}</Heading>
          <Text style={paragraph}>Olá, {userName}.</Text>
          <Text style={paragraph}>
            {inviterName} convidou você para atuar como <strong>{label}</strong>.
          </Text>
          <Text style={paragraph}>
            Clique no botão abaixo para definir sua senha e acessar a plataforma. Este link expira em{" "}
            <strong>{expirationDays} dias</strong>.
          </Text>
          <Section style={{ textAlign: "center" as const, margin: "32px 0" }}>
            <Button style={button} href={inviteUrl}>
              Definir senha e acessar
            </Button>
          </Section>
          <Text style={footer}>
            Se você não esperava este convite, ignore este email.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

const main = {
  backgroundColor: "#F4F4EE",
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

InviteTemplate.PreviewProps = {
  userName: "Ana Costa",
  inviterName: "Lucas Araujo",
  role: "PMB_SALES",
  inviteUrl: "https://profissionalizamaisbrasil.com.br/auth/accept-invite?token=abc123",
  expirationDays: 7,
  context: "pmb_team",
} satisfies InviteTemplateProps

export default InviteTemplate
