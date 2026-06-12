import { Button, Hr, Section, Text } from "@react-email/components"
import { EmailLayout, styles } from "./_layout"
import type { EmailBrand } from "../brand"

export interface EnrollmentTemplateProps {
  studentName: string
  courseName: string
  /** URL do painel do aluno (sua área dentro do sistema da revenda/PMB). */
  studentPanelUrl: string
  /** Marca da loja/revenda (header, rodapé). Default: PMB. */
  brand?: EmailBrand
}

export function EnrollmentTemplate({
  studentName,
  courseName,
  studentPanelUrl,
  brand,
}: EnrollmentTemplateProps) {
  const firstName = studentName.split(" ")[0] || studentName

  return (
    <EmailLayout
      preview={`Matrícula confirmada em ${courseName}`}
      brand={brand}
    >
      <Text style={styles.h1}>Tudo certo, {firstName}!</Text>
      <Text style={styles.paragraph}>
        Sua matrícula no curso <strong>{courseName}</strong> foi confirmada.
        Agora é só acessar sua área do aluno e começar.
      </Text>

      <Section style={styles.buttonRow}>
        <Button style={styles.primaryButton} href={studentPanelUrl}>
          Ir para minha área do aluno
        </Button>
      </Section>

      <Text style={styles.paragraphMuted}>
        Se o botão não funcionar, copie e cole no navegador:{" "}
        <a href={studentPanelUrl} style={styles.link}>
          {studentPanelUrl}
        </a>
      </Text>

      <Hr style={styles.hr} />

      <Section>
        <Text style={styles.h2}>O que fazer agora</Text>
        <Text style={styles.step}>
          1. Acesse sua área do aluno com o email e senha que você já cadastrou.
        </Text>
        <Text style={styles.step}>
          2. Clique em <strong>{courseName}</strong> para abrir a área de aulas.
        </Text>
        <Text style={styles.step}>
          3. Assista, faça as atividades e acompanhe seu progresso por lá.
        </Text>
      </Section>

      <Text style={styles.paragraphMuted}>
        Bons estudos! Qualquer dúvida, responda este email que a gente te
        ajuda.
      </Text>
    </EmailLayout>
  )
}

EnrollmentTemplate.PreviewProps = {
  studentName: "Beatriz Souza",
  courseName: "Auxiliar Administrativo",
  studentPanelUrl: "https://cursos-pro-joao.livrecursos.com.br/aluno",
  brand: {
    name: "Cursos Pro João",
    logoUrl: null,
    siteUrl: "https://cursos-pro-joao.livrecursos.com.br",
    siteLabel: "cursos-pro-joao.livrecursos.com.br",
    replyTo: null,
    isPmb: false,
  },
} satisfies EnrollmentTemplateProps

export default EnrollmentTemplate
