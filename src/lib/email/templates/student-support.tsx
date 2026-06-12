import { Button, Section, Text } from "@react-email/components"
import { EmailLayout, styles } from "./_layout"
import { PMB_EMAIL_BRAND, type EmailBrand } from "../brand"

export interface StudentSupportTemplateProps {
  /** Marca da loja (ou PMB na vitrine institucional). */
  brand?: EmailBrand
  /** Nome do aluno que mandou a mensagem. */
  studentName: string
  /** Email do aluno (canal de resposta). */
  studentEmail: string
  /** Telefone do aluno (opcional). */
  studentPhone?: string
  /** Assunto preenchido pelo aluno. */
  subject: string
  /** Corpo da mensagem. */
  message: string
  /** Link interno para o perfil do aluno no admin/painel. */
  studentPanelUrl: string
}

/**
 * Email disparado quando aluno envia um pedido de suporte pela area do aluno.
 * Vai pro contato do tenant (revendedor) ou pro time PMB quando vitrine
 * institucional. Inclui resposta direta via reply-to no header (configurado
 * no caller).
 */
export function StudentSupportTemplate({
  brand = PMB_EMAIL_BRAND,
  studentName,
  studentEmail,
  studentPhone,
  subject,
  message,
  studentPanelUrl,
}: StudentSupportTemplateProps) {
  const storeName = brand.name
  return (
    <EmailLayout
      preview={`Pedido de suporte: ${subject}`}
      brand={brand}
    >
      <Text style={styles.h1}>Novo pedido de suporte</Text>
      <Text style={styles.paragraph}>
        Um aluno da <strong>{storeName}</strong> enviou uma mensagem pelo
        canal de suporte da área do aluno.
      </Text>

      <Section style={styles.credentialBox}>
        <Text style={styles.credentialLabel}>De</Text>
        <Text style={styles.credentialValue}>
          {studentName} ({studentEmail}
          {studentPhone ? ` · ${studentPhone}` : ""})
        </Text>

        <Text style={styles.credentialLabel}>Assunto</Text>
        <Text style={styles.credentialValue}>{subject}</Text>

        <Text style={styles.credentialLabel}>Mensagem</Text>
        <Text style={{ ...styles.credentialValue, whiteSpace: "pre-wrap" }}>
          {message}
        </Text>
      </Section>

      <Section style={styles.buttonRow}>
        <Button style={styles.primaryButton} href={studentPanelUrl}>
          Abrir perfil do aluno
        </Button>
      </Section>

      <Text style={styles.paragraphMuted}>
        Você pode responder direto este email — a resposta volta para o aluno.
        Histórico completo no perfil pelo botão acima.
      </Text>
    </EmailLayout>
  )
}

StudentSupportTemplate.PreviewProps = {
  brand: {
    name: "Cursos Pro João",
    logoUrl: null,
    siteUrl: "https://cursos-pro-joao.livrecursos.com.br",
    siteLabel: "cursos-pro-joao.livrecursos.com.br",
    replyTo: null,
    isPmb: false,
  },
  studentName: "Pedro Henrique Oliveira",
  studentEmail: "pedro.henrique@email.com",
  studentPhone: "(11) 91234-5678",
  subject: "Dúvida sobre certificado",
  message:
    "Olá, terminei o curso de Auxiliar Administrativo há 3 dias mas o certificado ainda não apareceu na minha área. Quanto tempo demora? Obrigado!",
  studentPanelUrl: "https://profissionalizamaisbrasil.com.br/painel/alunos/abc123",
} satisfies StudentSupportTemplateProps

export default StudentSupportTemplate
