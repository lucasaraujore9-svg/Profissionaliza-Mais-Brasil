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

export interface PaymentTemplateProps {
  customerName: string
  amount: string
  paymentDate: string
  description: string
  receiptUrl?: string
}

export function PaymentTemplate({
  customerName,
  amount,
  paymentDate,
  description,
  receiptUrl,
}: PaymentTemplateProps) {
  return (
    <Html>
      <Head />
      <Preview>Pagamento recebido: {amount}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Pagamento confirmado</Heading>
          <Text style={paragraph}>Olá, {customerName}!</Text>
          <Text style={paragraph}>
            Recebemos seu pagamento. Obrigado!
          </Text>
          <Section style={detailsBox}>
            <Text style={detailLine}>
              <strong>Valor:</strong> {amount}
            </Text>
            <Text style={detailLine}>
              <strong>Data:</strong> {paymentDate}
            </Text>
            <Text style={detailLine}>
              <strong>Descrição:</strong> {description}
            </Text>
          </Section>
          {receiptUrl && (
            <Section style={{ textAlign: "center" as const, margin: "32px 0" }}>
              <Button style={button} href={receiptUrl}>
                Ver Comprovante
              </Button>
            </Section>
          )}
          <Text style={footer}>
            Guarde este email como comprovante do seu pagamento.
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
  color: "#10B981",
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

const detailsBox = {
  backgroundColor: "#F3F4F6",
  borderRadius: "8px",
  padding: "16px",
  margin: "16px 0",
}

const detailLine = {
  color: "#1A1A2E",
  fontSize: "14px",
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

PaymentTemplate.PreviewProps = {
  customerName: "Maria Silva",
  amount: "R$ 197,00",
  paymentDate: "20/05/2026",
  description: "Mensalidade Profissionaliza Mais Brasil — Plano Starter",
  receiptUrl: "https://www.asaas.com/i/receipt/abc123",
} satisfies PaymentTemplateProps

export default PaymentTemplate
