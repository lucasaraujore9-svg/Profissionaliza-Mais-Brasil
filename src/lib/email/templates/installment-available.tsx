import { Button, Hr, Section, Text } from "@react-email/components"
import { EmailLayout, styles } from "./_layout"
import type { EmailBrand } from "../brand"

export interface InstallmentAvailableTemplateProps {
  studentName: string
  courseName: string
  /** Valor da parcela, já formatado ("R$ 150,00"). */
  amount: string
  /** Vencimento, já formatado ("15/11/2026"). */
  dueDate: string
  /** Página de pagamento da plataforma (`/pagar/<id>` da loja certa). */
  paymentUrl: string
  /** Marca da loja/revenda (header, rodapé). Default: PMB. */
  brand?: EmailBrand
}

/**
 * Parcelado no PIX/boleto: a parcela entrou na janela de 7 dias antes do
 * vencimento e já pode ser paga na página de pagamento.
 */
export function InstallmentAvailableTemplate({
  studentName,
  courseName,
  amount,
  dueDate,
  paymentUrl,
  brand,
}: InstallmentAvailableTemplateProps) {
  const firstName = studentName.split(" ")[0] || studentName

  return (
    <EmailLayout preview={`Sua parcela de ${courseName} está disponível`} brand={brand}>
      <Text style={styles.h1}>Sua parcela está disponível, {firstName}</Text>
      <Text style={styles.paragraph}>
        A parcela de <strong>{amount}</strong> do curso <strong>{courseName}</strong> vence em{" "}
        <strong>{dueDate}</strong> e já pode ser paga.
      </Text>

      <Section style={styles.buttonRow}>
        <Button style={styles.primaryButton} href={paymentUrl}>
          Pagar a parcela
        </Button>
      </Section>
      <Text style={styles.paragraphMuted}>
        Se o botão não funcionar, copie e cole no navegador:{" "}
        <a href={paymentUrl} style={styles.link}>
          {paymentUrl}
        </a>
      </Text>

      <Hr style={styles.hr} />

      <Text style={styles.paragraphMuted}>
        Pagar até o vencimento mantém seu acesso ao curso em dia. Qualquer dúvida, responda este email.
      </Text>
    </EmailLayout>
  )
}

InstallmentAvailableTemplate.PreviewProps = {
  studentName: "Carlos Lima",
  courseName: "Eletricista Predial",
  amount: "R$ 150,00",
  dueDate: "15/11/2026",
  paymentUrl: "https://cursos-pro-joao.livrecursos.com.br/pagar/enr_123",
  brand: {
    name: "Cursos Pro João",
    logoUrl: null,
    siteUrl: "https://cursos-pro-joao.livrecursos.com.br",
    siteLabel: "cursos-pro-joao.livrecursos.com.br",
    replyTo: null,
    isPmb: false,
  },
} satisfies InstallmentAvailableTemplateProps

export default InstallmentAvailableTemplate
