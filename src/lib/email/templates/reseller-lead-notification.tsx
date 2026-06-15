import { Section, Text } from "@react-email/components"
import { EmailLayout, styles } from "./_layout"
import { PMB_EMAIL_BRAND, type EmailBrand } from "../brand"

export interface ResellerLeadNotificationTemplateProps {
  // Marca da UNIDADE (nunca a da PMB) — header/rodapé/remetente da revenda.
  brand?: EmailBrand
  // Curso que o interessado tentou comprar.
  courseName: string
  // Dados de contato do interessado.
  leadName: string
  leadEmail: string
  leadPhone: string
  // Mensagem opcional escrita pelo interessado.
  message?: string | null
}

/**
 * Enviado ao e-mail principal da revenda quando um interessado preenche o
 * formulário de contato da vitrine (exibido porque a unidade ainda não
 * configurou o checkout). O `replyTo` do envio é o e-mail do interessado, então
 * a revenda responde direto para ele. O mesmo contato vira um lead no menu de
 * leads (visível quando a Automação está ativa).
 */
export function ResellerLeadNotificationTemplate({
  brand = PMB_EMAIL_BRAND,
  courseName,
  leadName,
  leadEmail,
  leadPhone,
  message,
}: ResellerLeadNotificationTemplateProps) {
  return (
    <EmailLayout
      brand={brand}
      preview={`Novo interesse de compra: ${courseName}`}
    >
      <Text style={styles.h1}>Você recebeu um novo interesse de compra</Text>
      <Text style={styles.paragraph}>
        Um visitante da sua loja quis comprar o curso{" "}
        <strong>{courseName}</strong>, mas o pagamento online ainda não está
        ativo na sua unidade. Entre em contato para fechar a venda.
      </Text>

      <Section style={styles.detailsBox}>
        <Text style={styles.detailRow}>
          <strong>Nome:</strong> {leadName}
        </Text>
        <Text style={styles.detailRow}>
          <strong>E-mail:</strong> {leadEmail}
        </Text>
        <Text style={styles.detailRow}>
          <strong>Telefone:</strong> {leadPhone}
        </Text>
        <Text style={styles.detailRow}>
          <strong>Curso de interesse:</strong> {courseName}
        </Text>
        {message ? (
          <Text style={styles.detailRow}>
            <strong>Mensagem:</strong> {message}
          </Text>
        ) : null}
      </Section>

      <Text style={styles.paragraph}>
        Responda este e-mail para falar diretamente com o interessado. Para
        receber pagamentos online automaticamente, conclua a configuração do
        gateway (Mercado Pago ou Asaas) no seu painel.
      </Text>

      <Text style={styles.paragraphMuted}>
        Este contato também ficou registrado no menu <strong>Leads</strong> do
        seu painel (disponível quando a Automação está ativa).
      </Text>
    </EmailLayout>
  )
}

ResellerLeadNotificationTemplate.PreviewProps = {
  courseName: "Excel Avançado",
  leadName: "Maria Souza",
  leadEmail: "maria@exemplo.com",
  leadPhone: "+55 11 99999-0000",
  message: "Tenho interesse, podem me chamar no WhatsApp?",
} satisfies ResellerLeadNotificationTemplateProps

export default ResellerLeadNotificationTemplate
