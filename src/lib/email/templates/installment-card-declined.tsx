import { Button, Hr, Section, Text } from "@react-email/components"
import { EmailLayout, styles } from "./_layout"
import type { EmailBrand } from "../brand"

export interface InstallmentCardDeclinedTemplateProps {
  studentName: string
  courseName: string
  /** Valor da parcela recusada, já formatado ("R$ 100,00"). */
  amount: string
  /** Página de pagamento da plataforma (`/pagar/<id>` da loja certa). */
  paymentUrl: string
  /** Marca da loja/revenda (header, rodapé). Default: PMB. */
  brand?: EmailBrand
}

/**
 * Parcelado no cartão: o cartão recusou a parcela e a cobrança automática foi
 * desligada. A parcela segue em aberto e pode ser paga por PIX, boleto ou outro
 * cartão na página de pagamento.
 */
export function InstallmentCardDeclinedTemplate({
  studentName,
  courseName,
  amount,
  paymentUrl,
  brand,
}: InstallmentCardDeclinedTemplateProps) {
  const firstName = studentName.split(" ")[0] || studentName

  return (
    <EmailLayout preview={`Seu cartão recusou a parcela de ${courseName}`} brand={brand}>
      <Text style={styles.h1}>Seu cartão foi recusado, {firstName}</Text>
      <Text style={styles.paragraph}>
        O cartão não aprovou a parcela de <strong>{amount}</strong> do curso{" "}
        <strong>{courseName}</strong>. Por isso a cobrança automática no cartão foi desligada:
        nada mais será cobrado nele sem você pedir.
      </Text>
      <Text style={styles.paragraph}>
        Para manter o acesso em dia, pague esta parcela por PIX, boleto ou outro cartão.
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
        Cartões costumam recusar por limite ou cartão vencido. Qualquer dúvida, responda este email.
      </Text>
    </EmailLayout>
  )
}

InstallmentCardDeclinedTemplate.PreviewProps = {
  studentName: "Carlos Lima",
  courseName: "Eletricista Predial",
  amount: "R$ 100,00",
  paymentUrl: "https://cursos-pro-joao.livrecursos.com.br/pagar/enr_123",
  brand: {
    name: "Cursos Pro João",
    logoUrl: null,
    siteUrl: "https://cursos-pro-joao.livrecursos.com.br",
    siteLabel: "cursos-pro-joao.livrecursos.com.br",
    replyTo: null,
    isPmb: false,
  },
} satisfies InstallmentCardDeclinedTemplateProps

export default InstallmentCardDeclinedTemplate
