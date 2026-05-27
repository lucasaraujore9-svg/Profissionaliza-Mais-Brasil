import { Button, Section, Text } from "@react-email/components"
import { EmailLayout, styles } from "./_layout"

export type PaymentVariant = "confirmed" | "overdue" | "refunded"

export interface PaymentTemplateProps {
  customerName: string
  amount: string
  paymentDate: string
  description: string
  receiptUrl?: string
  /** Determina cor + título. Default: confirmed (retrocompat). */
  variant?: PaymentVariant
}

const variantConfig: Record<
  PaymentVariant,
  {
    headline: string
    accentColor: string
    accentBg: string
    accentBorder: string
    chipLabel: string
    cta?: string
  }
> = {
  confirmed: {
    headline: "Pagamento confirmado",
    accentColor: "#025918",
    accentBg: "#F0FDF4",
    accentBorder: "#BBF7D0",
    chipLabel: "Recebido",
    cta: "Ver comprovante",
  },
  overdue: {
    headline: "Mensalidade em atraso",
    accentColor: "#B45309",
    accentBg: "#FFFBEB",
    accentBorder: "#FDE68A",
    chipLabel: "Vencido",
    cta: "Pagar agora",
  },
  refunded: {
    headline: "Pagamento estornado",
    accentColor: "#9F1239",
    accentBg: "#FFF1F2",
    accentBorder: "#FECDD3",
    chipLabel: "Estornado",
    cta: "Ver detalhes",
  },
}

export function PaymentTemplate({
  customerName,
  amount,
  paymentDate,
  description,
  receiptUrl,
  variant = "confirmed",
}: PaymentTemplateProps) {
  const cfg = variantConfig[variant]

  return (
    <EmailLayout preview={`${cfg.headline} — ${amount}`}>
      <Text
        style={{
          ...styles.h1,
          color: cfg.accentColor,
        }}
      >
        {cfg.headline}
      </Text>
      <Text style={styles.paragraph}>Olá, {customerName}.</Text>
      <Text style={styles.paragraph}>{description}</Text>

      <Section
        style={{
          backgroundColor: cfg.accentBg,
          border: `1px solid ${cfg.accentBorder}`,
          borderRadius: "12px",
          padding: "20px",
          margin: "16px 0",
        }}
      >
        <Text
          style={{
            color: cfg.accentColor,
            fontSize: "11px",
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase" as const,
            margin: "0 0 6px",
          }}
        >
          {cfg.chipLabel}
        </Text>
        <Text
          style={{
            color: cfg.accentColor,
            fontSize: "28px",
            fontWeight: 900,
            margin: "0 0 14px",
          }}
        >
          {amount}
        </Text>
        <Text style={styles.detailRow}>
          <strong>Data:</strong> {paymentDate}
        </Text>
      </Section>

      {receiptUrl && cfg.cta && (
        <Section style={styles.buttonRow}>
          <Button style={styles.primaryButton} href={receiptUrl}>
            {cfg.cta}
          </Button>
        </Section>
      )}

      {variant === "confirmed" && (
        <Text style={styles.paragraphMuted}>
          Guarde este email — ele serve como comprovante do seu pagamento.
        </Text>
      )}
      {variant === "overdue" && (
        <Text style={styles.paragraphMuted}>
          Regularize o quanto antes para evitar bloqueio dos seus alunos e
          interrupção da sua vitrine.
        </Text>
      )}
      {variant === "refunded" && (
        <Text style={styles.paragraphMuted}>
          Se você não solicitou o estorno, entre em contato com a gente
          respondendo este email.
        </Text>
      )}
    </EmailLayout>
  )
}

PaymentTemplate.PreviewProps = {
  customerName: "Maria Silva",
  amount: "R$ 197,00",
  paymentDate: "20/05/2026",
  description: "Recebemos sua mensalidade do Profissionaliza Mais Brasil — obrigado!",
  receiptUrl: "https://www.asaas.com/i/receipt/abc123",
  variant: "confirmed",
} satisfies PaymentTemplateProps

export default PaymentTemplate
