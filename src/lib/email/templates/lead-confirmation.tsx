import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components"

export interface LeadConfirmationTemplateProps {
  companyName: string
}

export function LeadConfirmationTemplate({
  companyName,
}: LeadConfirmationTemplateProps) {
  return (
    <Html>
      <Head />
      <Preview>Recebemos seu interesse — Profissionaliza Mais Brasil</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Obrigado!</Heading>
          <Text style={paragraph}>
            Recebemos o interesse de <strong>{companyName}</strong> em se tornar
            um revendedor do Profissionaliza Mais Brasil.
          </Text>
          <Text style={paragraph}>
            Um de nossos consultores entrará em contato em até 1 dia útil para
            apresentar os planos e tirar suas dúvidas.
          </Text>
          <Section style={{ marginTop: "24px" }}>
            <Text style={paragraph}>
              Enquanto isso, fique à vontade para explorar a plataforma em{" "}
              <a href="https://profissionalizamaisbrasil.com.br" style={link}>
                profissionalizamaisbrasil.com.br
              </a>
              .
            </Text>
          </Section>
          <Text style={footer}>
            Este email confirma o recebimento do seu cadastro de interesse.
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

const link = {
  color: "#3B82F6",
  textDecoration: "underline",
}

const footer = {
  color: "#9CA3AF",
  fontSize: "12px",
  lineHeight: "1.4",
  margin: "24px 0 0",
  textAlign: "center" as const,
}
