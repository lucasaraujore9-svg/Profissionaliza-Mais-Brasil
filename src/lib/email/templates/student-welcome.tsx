import { Button, Section, Text } from "@react-email/components"
import { EmailLayout, styles } from "./_layout"
import { PMB_EMAIL_BRAND, type EmailBrand } from "../brand"

export interface StudentWelcomeTemplateProps {
  studentName: string
  studentEmail: string
  temporaryPassword: string
  loginUrl: string
  /** Marca da loja/revenda (header, rodapé, corpo). Default: PMB. */
  brand?: EmailBrand
  /**
   * Rótulo da senha no box de credenciais. Default "Senha temporária" (senha
   * gerada pelo sistema). Quem atende pode DEFINIR uma senha específica para o
   * aluno — nesse caso ela não é temporária e o email não deve chamá-la assim.
   */
  passwordLabel?: string
}

/**
 * Boas-vindas ao painel do aluno após a primeira compra. Inclui senha
 * temporária para o primeiro acesso. O usuário deve trocar a senha
 * em `Perfil → Alterar senha`.
 */
export function StudentWelcomeTemplate({
  studentName,
  studentEmail,
  temporaryPassword,
  loginUrl,
  brand = PMB_EMAIL_BRAND,
  passwordLabel = "Senha temporária",
}: StudentWelcomeTemplateProps) {
  const firstName = studentName.split(" ")[0] || studentName
  const storeName = brand.name

  return (
    <EmailLayout
      preview={`Sua conta em ${storeName} está pronta`}
      brand={brand}
    >
      <Text style={styles.h1}>Bem-vindo(a), {firstName}!</Text>
      <Text style={styles.paragraph}>
        Sua compra em <strong>{storeName}</strong> foi registrada e sua{" "}
        <strong>área do aluno</strong> já está pronta. Ela é a sua{" "}
        <strong>plataforma acadêmica</strong>: o ponto central de onde você
        acessa a plataforma de aulas, acompanha as matrículas e baixa seus
        certificados.
      </Text>

      <Section>
        <Text style={styles.h2}>O que você encontra na sua área</Text>
        <Text style={styles.step}>
          · Acesso à plataforma de aulas (com login e senha ou acesso direto)
        </Text>
        <Text style={styles.step}>· Status das matrículas e progresso</Text>
        <Text style={styles.step}>· Faturas, recibos e segundas vias</Text>
        <Text style={styles.step}>· Certificados quando você concluir um curso</Text>
      </Section>

      <Section style={styles.credentialBox}>
        <Text style={styles.credentialLabel}>Seu acesso</Text>
        <Text style={styles.credentialValue}>{studentEmail}</Text>

        <Text style={styles.credentialLabel}>{passwordLabel}</Text>
        <Text style={styles.credentialValueMono}>{temporaryPassword}</Text>

        <Text style={styles.credentialHint}>
          Por segurança, troque a senha no primeiro acesso em{" "}
          <strong>Perfil → Alterar senha</strong>.
        </Text>
      </Section>

      <Section style={styles.buttonRow}>
        <Button style={styles.primaryButton} href={loginUrl}>
          Acessar minha área
        </Button>
      </Section>

      <Text style={styles.paragraphMuted}>
        Se o botão não funcionar, copie e cole no navegador:{" "}
        <a href={loginUrl} style={styles.link}>
          {loginUrl}
        </a>
      </Text>

      <Text style={styles.paragraphMuted}>
        Se você não fez esta compra, é só ignorar este email.
      </Text>
    </EmailLayout>
  )
}

StudentWelcomeTemplate.PreviewProps = {
  studentName: "Pedro Henrique Oliveira",
  studentEmail: "pedro.henrique@email.com",
  temporaryPassword: "Pmb#Aluno2026",
  loginUrl: "https://cursos-pro-joao.livrecursos.com.br/aluno",
  brand: {
    name: "Cursos Pro João",
    logoUrl: null,
    siteUrl: "https://cursos-pro-joao.livrecursos.com.br",
    siteLabel: "cursos-pro-joao.livrecursos.com.br",
    replyTo: null,
    isPmb: false,
  },
} satisfies StudentWelcomeTemplateProps

export default StudentWelcomeTemplate
