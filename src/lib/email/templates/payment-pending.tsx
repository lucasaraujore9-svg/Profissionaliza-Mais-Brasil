import { Button, Hr, Section, Text } from "@react-email/components"
import { EmailLayout, styles } from "./_layout"
import type { EmailBrand } from "../brand"

export interface PaymentPendingTemplateProps {
  studentName: string
  courseName: string
  /** Valor formatado em BR, ex.: "R$ 149,90". */
  amount: string
  /** Rótulo do meio de pagamento aguardando, ex.: "boleto" ou "Pix". */
  methodLabel: string
  /** Link do boleto/Pix (ticket_url do MP). Quando ausente, esconde o botão. */
  paymentUrl?: string | null
  /** Data de vencimento formatada, ex.: "25/06/2026". Opcional. */
  dueDate?: string | null
  /** Marca da loja/revenda (header, rodapé). Default: PMB. */
  brand?: EmailBrand
}

/**
 * Aluno comprou e o pagamento está AGUARDANDO confirmação (boleto/Pix). Reforça
 * o que fazer para concluir — antes disso o aluno só via um status in-app.
 */
export function PaymentPendingTemplate({
  studentName,
  courseName,
  amount,
  methodLabel,
  paymentUrl,
  dueDate,
  brand,
}: PaymentPendingTemplateProps) {
  const firstName = studentName.split(" ")[0] || studentName

  return (
    <EmailLayout preview={`Falta pouco para garantir ${courseName}`} brand={brand}>
      <Text style={styles.h1}>Falta pouco, {firstName}!</Text>
      <Text style={styles.paragraph}>
        Recebemos seu pedido do curso <strong>{courseName}</strong>, mas o
        pagamento via <strong>{methodLabel}</strong> ainda está{" "}
        <strong>aguardando confirmação</strong>. Assim que ele for confirmado,
        liberamos seu acesso automaticamente e avisamos por email.
      </Text>

      <Section style={styles.detailsBox}>
        <Text style={styles.detailRow}>
          <strong>Curso:</strong> {courseName}
        </Text>
        <Text style={styles.detailRow}>
          <strong>Valor:</strong> {amount}
        </Text>
        <Text style={styles.detailRow}>
          <strong>Forma de pagamento:</strong> {methodLabel}
        </Text>
        {dueDate ? (
          <Text style={styles.detailRow}>
            <strong>Vence em:</strong> {dueDate}
          </Text>
        ) : null}
      </Section>

      {paymentUrl ? (
        <>
          <Section style={styles.buttonRow}>
            <Button style={styles.primaryButton} href={paymentUrl}>
              Concluir pagamento
            </Button>
          </Section>
          <Text style={styles.paragraphMuted}>
            Se o botão não funcionar, copie e cole no navegador:{" "}
            <a href={paymentUrl} style={styles.link}>
              {paymentUrl}
            </a>
          </Text>
        </>
      ) : null}

      <Hr style={styles.hr} />

      <Text style={styles.paragraphMuted}>
        Já pagou? Pode ignorar este email — a confirmação do {methodLabel} pode
        levar alguns instantes (Pix) ou até alguns dias úteis (boleto). Qualquer
        dúvida, responda este email.
      </Text>
    </EmailLayout>
  )
}

PaymentPendingTemplate.PreviewProps = {
  studentName: "Carlos Lima",
  courseName: "Eletricista Predial",
  amount: "R$ 149,90",
  methodLabel: "boleto",
  paymentUrl: "https://www.mercadopago.com.br/boleto/exemplo",
  dueDate: "30/06/2026",
  brand: {
    name: "Cursos Pro João",
    logoUrl: null,
    siteUrl: "https://cursos-pro-joao.livrecursos.com.br",
    siteLabel: "cursos-pro-joao.livrecursos.com.br",
    replyTo: null,
    isPmb: false,
  },
} satisfies PaymentPendingTemplateProps

export default PaymentPendingTemplate
