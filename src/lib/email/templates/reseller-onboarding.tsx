import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components"

export interface ResellerOnboardingTemplateProps {
  ownerName: string
  resellerName: string
  loginEmail: string
  tempPassword: string
  loginUrl: string
  vitrineUrl: string
  paymentUrl: string | null
  planValue: number
}

export function ResellerOnboardingTemplate({
  ownerName,
  resellerName,
  loginEmail,
  tempPassword,
  loginUrl,
  vitrineUrl,
  paymentUrl,
  planValue,
}: ResellerOnboardingTemplateProps) {
  const planFormatted = `R$ ${planValue.toFixed(2).replace(".", ",")}`

  return (
    <Html>
      <Head />
      <Preview>
        {paymentUrl
          ? "Sua revenda foi criada — finalize o pagamento da primeira mensalidade"
          : "Sua revenda foi criada — aguardando pagamento"}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Bem-vindo(a), {ownerName}!</Heading>
          <Text style={paragraph}>
            Sua revenda <strong>{resellerName}</strong> foi criada no
            Profissionaliza Mais Brasil. Para ativar sua vitrine e começar a
            vender, finalize o pagamento da primeira mensalidade abaixo.
          </Text>

          {paymentUrl && (
            <>
              <Section style={highlightBox}>
                <Text style={highlightLabel}>Primeira mensalidade</Text>
                <Text style={highlightValue}>{planFormatted}</Text>
                <Text style={paragraphSmall}>
                  Pague via Pix, boleto ou cartão. Sua vitrine fica ativa
                  automaticamente assim que o pagamento for confirmado.
                </Text>
                <Button style={button} href={paymentUrl}>
                  Pagar primeira mensalidade
                </Button>
              </Section>

              <Hr style={hr} />
            </>
          )}

          <Section>
            <Heading as="h2" style={h2}>
              Suas credenciais de acesso
            </Heading>
            <Text style={paragraph}>
              Use os dados abaixo para entrar no painel administrativo da sua
              revenda. <strong>Recomendamos trocar a senha no primeiro acesso.</strong>
            </Text>

            <Text style={kvLabel}>Email</Text>
            <Text style={kvValue}>{loginEmail}</Text>

            <Text style={kvLabel}>Senha temporária</Text>
            <Text style={kvValueMono}>{tempPassword}</Text>

            <Button style={buttonOutline} href={loginUrl}>
              Acessar painel
            </Button>
          </Section>

          <Hr style={hr} />

          <Section>
            <Heading as="h2" style={h2}>
              Sua vitrine
            </Heading>
            <Text style={paragraph}>
              Esse é o endereço que seus alunos vão acessar:
            </Text>
            <Text style={kvValue}>
              <a href={vitrineUrl} style={link}>
                {vitrineUrl}
              </a>
            </Text>
            <Text style={paragraphSmall}>
              A vitrine fica visível assim que o pagamento da primeira
              mensalidade for confirmado.
            </Text>
          </Section>

          <Hr style={hr} />

          <Section>
            <Heading as="h2" style={h2}>
              Próximos passos depois do pagamento
            </Heading>
            <Text style={step}>1. Personalize sua vitrine: logo, cores, banner</Text>
            <Text style={step}>2. Conecte sua conta Mercado Pago para receber pagamentos dos alunos</Text>
            <Text style={step}>3. Ajuste preços e visibilidade dos cursos</Text>
            <Text style={step}>4. Compartilhe sua vitrine nas redes sociais</Text>
          </Section>

          <Text style={footer}>
            Este é um e-mail automático. Em caso de dúvidas, responda este
            email que retornamos por aqui mesmo.
          </Text>
          <Text style={footer}>
            Profissionaliza Mais Brasil
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

const main = {
  backgroundColor: "#F4F6F8",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
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

const h2 = {
  color: "#025918",
  fontSize: "18px",
  fontWeight: "700",
  margin: "0 0 12px",
}

const paragraph = {
  color: "#1A1A2E",
  fontSize: "15px",
  lineHeight: "1.6",
  margin: "0 0 16px",
}

const paragraphSmall = {
  color: "#6B7280",
  fontSize: "13px",
  lineHeight: "1.5",
  margin: "0 0 12px",
}

const highlightBox = {
  backgroundColor: "#F0FDF4",
  border: "1px solid #C0D904",
  borderRadius: "12px",
  padding: "20px",
  margin: "16px 0",
  textAlign: "center" as const,
}

const highlightLabel = {
  color: "#025918",
  fontSize: "12px",
  fontWeight: "700",
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
  margin: "0 0 4px",
}

const highlightValue = {
  color: "#025918",
  fontSize: "32px",
  fontWeight: "900",
  margin: "0 0 8px",
}

const button = {
  backgroundColor: "#F2B705",
  borderRadius: "8px",
  color: "#025918",
  fontSize: "16px",
  fontWeight: "800",
  textDecoration: "none",
  textAlign: "center" as const,
  padding: "12px 24px",
  display: "inline-block",
}

const buttonOutline = {
  backgroundColor: "#025918",
  borderRadius: "8px",
  color: "#FFFFFF",
  fontSize: "14px",
  fontWeight: "700",
  textDecoration: "none",
  textAlign: "center" as const,
  padding: "10px 20px",
  display: "inline-block",
  marginTop: "8px",
}

const kvLabel = {
  color: "#6B7280",
  fontSize: "11px",
  fontWeight: "700",
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
  margin: "12px 0 4px",
}

const kvValue = {
  color: "#1A1A2E",
  fontSize: "15px",
  fontWeight: "600",
  margin: "0 0 8px",
}

const kvValueMono = {
  color: "#1A1A2E",
  fontSize: "16px",
  fontWeight: "700",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  backgroundColor: "#F4F6F8",
  borderRadius: "6px",
  padding: "8px 12px",
  margin: "0 0 8px",
  display: "inline-block",
}

const link = {
  color: "#025918",
  textDecoration: "underline",
}

const hr = {
  border: "none",
  borderTop: "1px solid #E5E7EB",
  margin: "24px 0",
}

const step = {
  color: "#1A1A2E",
  fontSize: "14px",
  lineHeight: "1.6",
  margin: "0 0 6px",
}

const footer = {
  color: "#9CA3AF",
  fontSize: "12px",
  lineHeight: "1.5",
  margin: "20px 0 0",
  textAlign: "center" as const,
}
