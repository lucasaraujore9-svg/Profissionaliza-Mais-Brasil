import { Section, Text } from "@react-email/components"
import { EmailLayout, styles } from "./_layout"

export interface LeadConfirmationTemplateProps {
  companyName: string
}

export function LeadConfirmationTemplate({
  companyName,
}: LeadConfirmationTemplateProps) {
  return (
    <EmailLayout preview="Recebemos seu contato — Profissionaliza Mais Brasil">
      <Text style={styles.h1}>Recebemos seu contato!</Text>
      <Text style={styles.paragraph}>
        Obrigado pelo interesse, <strong>{companyName}</strong>. Sua mensagem
        chegou direto na equipe comercial do Profissionaliza Mais Brasil.
      </Text>

      <Text style={styles.paragraph}>
        Um consultor entra em contato em <strong>até 1 dia útil</strong> para
        apresentar os planos, tirar dúvidas e te ajudar a montar sua revenda.
      </Text>

      <Section>
        <Text style={styles.h2}>Enquanto isso, dá uma olhada na plataforma</Text>
        <Text style={styles.paragraph}>
          Conheça os cursos, veja exemplos de vitrines no ar e entenda como
          funciona a parceria em{" "}
          <a href="https://profissionalizamaisbrasil.com.br" style={styles.link}>
            profissionalizamaisbrasil.com.br
          </a>
          .
        </Text>
      </Section>

      <Text style={styles.paragraphMuted}>
        Este email confirma o recebimento do seu cadastro de interesse. Se você
        não enviou esta solicitação, pode ignorar a mensagem.
      </Text>
    </EmailLayout>
  )
}

LeadConfirmationTemplate.PreviewProps = {
  companyName: "Escola Profissional XYZ Ltda",
} satisfies LeadConfirmationTemplateProps

export default LeadConfirmationTemplate
