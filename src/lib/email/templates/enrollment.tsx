import { Button, Hr, Section, Text } from "@react-email/components"
import { EmailLayout, styles } from "./_layout"
import type { EmailBrand } from "../brand"

export interface EnrollmentTemplateProps {
  studentName: string
  courseName: string
  /** URL do painel do aluno (sua área dentro do sistema da revenda/PMB). */
  studentPanelUrl: string
  /**
   * true  = aluno novo (1ª compra) → "matrícula confirmada".
   * false = aluno antigo comprando um curso novo → "novo curso liberado".
   */
  isNewStudent?: boolean
  /** Marca da loja/revenda (header, rodapé). Default: PMB. */
  brand?: EmailBrand
}

export function EnrollmentTemplate({
  studentName,
  courseName,
  studentPanelUrl,
  isNewStudent = true,
  brand,
}: EnrollmentTemplateProps) {
  const firstName = studentName.split(" ")[0] || studentName

  return (
    <EmailLayout
      preview={
        isNewStudent
          ? `Matrícula confirmada em ${courseName}`
          : `Novo curso liberado: ${courseName}`
      }
      brand={brand}
    >
      <Text style={styles.h1}>
        {isNewStudent ? `Tudo certo, ${firstName}!` : `Novo curso liberado, ${firstName}!`}
      </Text>
      <Text style={styles.paragraph}>
        {isNewStudent ? (
          <>
            Sua matrícula no curso <strong>{courseName}</strong> foi confirmada e
            já está disponível na sua <strong>área do aluno</strong>.
          </>
        ) : (
          <>
            Você acaba de adquirir o curso <strong>{courseName}</strong> e ele já
            está liberado na sua <strong>área do aluno</strong>, junto dos seus
            outros cursos.
          </>
        )}
      </Text>
      <Text style={styles.paragraph}>
        A área do aluno é a sua <strong>plataforma acadêmica</strong>: o ponto
        central de onde você abre as aulas, acompanha o progresso e baixa seus
        certificados.
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
        <Text style={styles.h2}>Como acessar suas aulas</Text>
        <Text style={styles.step}>
          1. Entre na sua área do aluno com o seu e-mail e senha.
        </Text>
        <Text style={styles.step}>
          2. Abra <strong>{courseName}</strong> e clique em{" "}
          <strong>acessar a plataforma de aulas</strong>.
        </Text>
        <Text style={styles.step}>
          3. É na plataforma de aulas que ficam os vídeos e atividades — seu
          progresso volta para a área do aluno.
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
  isNewStudent: true,
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
