import { Button, Hr, Section, Text } from "@react-email/components"
import { EmailLayout, styles } from "./_layout"
import type { EmailBrand } from "../brand"

export interface PaymentRejectedTemplateProps {
  studentName: string
  courseName: string
  /** URL para tentar de novo (página do curso na vitrine). Esconde o botão se ausente. */
  retryUrl?: string | null
  /** Motivo amigável, ex.: "o cartão foi recusado". Opcional. */
  reason?: string | null
  /** Marca da loja/revenda (header, rodapé). Default: PMB. */
  brand?: EmailBrand
}

/**
 * Pagamento do aluno foi RECUSADO/expirou (cartão recusado, boleto vencido, Pix
 * não pago). Convida a tentar de novo — antes disso o aluno não recebia aviso.
 */
export function PaymentRejectedTemplate({
  studentName,
  courseName,
  retryUrl,
  reason,
  brand,
}: PaymentRejectedTemplateProps) {
  const firstName = studentName.split(" ")[0] || studentName

  return (
    <EmailLayout
      preview={`Não conseguimos confirmar seu pagamento de ${courseName}`}
      brand={brand}
    >
      <Text style={styles.h1}>Não foi dessa vez, {firstName}</Text>
      <Text style={styles.paragraph}>
        Não conseguimos confirmar o pagamento do curso{" "}
        <strong>{courseName}</strong>
        {reason ? (
          <>
            {" "}
            porque {reason}
          </>
        ) : null}
        . Mas é rápido tentar de novo — seus dados não foram perdidos.
      </Text>

      {retryUrl ? (
        <>
          <Section style={styles.buttonRow}>
            <Button style={styles.primaryButton} href={retryUrl}>
              Tentar novamente
            </Button>
          </Section>
          <Text style={styles.paragraphMuted}>
            Se o botão não funcionar, copie e cole no navegador:{" "}
            <a href={retryUrl} style={styles.link}>
              {retryUrl}
            </a>
          </Text>
        </>
      ) : null}

      <Hr style={styles.hr} />

      <Text style={styles.paragraphMuted}>
        Dica: cartões costumam recusar por limite ou dados digitados errados.
        Você também pode pagar por Pix para liberar o acesso na hora. Qualquer
        dúvida, responda este email.
      </Text>
    </EmailLayout>
  )
}

PaymentRejectedTemplate.PreviewProps = {
  studentName: "Carlos Lima",
  courseName: "Eletricista Predial",
  retryUrl: "https://cursos-pro-joao.livrecursos.com.br/curso/eletricista-predial",
  reason: "o cartão foi recusado",
  brand: {
    name: "Cursos Pro João",
    logoUrl: null,
    siteUrl: "https://cursos-pro-joao.livrecursos.com.br",
    siteLabel: "cursos-pro-joao.livrecursos.com.br",
    replyTo: null,
    isPmb: false,
  },
} satisfies PaymentRejectedTemplateProps

export default PaymentRejectedTemplate
