import { Button, Hr, Section, Text } from "@react-email/components"
import { EmailLayout, styles } from "./_layout"

export interface AccessExpiringTemplateProps {
  studentName: string
  courseName: string
  /** Data (já formatada, ex: "15/06/2026") em que o acesso será encerrado. */
  expiresAtLabel: string
  /** Dias restantes até o encerramento. */
  daysLeft: number
  /** URL da área do aluno. */
  studentPanelUrl: string
  /** Nome da loja/revenda. Usado no cabeçalho/rodapé. */
  storeName?: string
}

/**
 * Aviso de proximidade do fim do período de acesso (item 11 dos
 * aperfeiçoamentos). Disparado pelo cron `sweep-students-expired` quando faltam
 * poucos dias para o encerramento dos 12 meses de permanência.
 */
export function AccessExpiringTemplate({
  studentName,
  courseName,
  expiresAtLabel,
  daysLeft,
  studentPanelUrl,
  storeName,
}: AccessExpiringTemplateProps) {
  const firstName = studentName.split(" ")[0] || studentName

  return (
    <EmailLayout
      preview={`Seu acesso a ${courseName} encerra em ${daysLeft} dia(s)`}
      brandName={storeName ?? "Profissionaliza Mais Brasil"}
      brandTagline={storeName ? "via Profissionaliza Mais Brasil" : undefined}
    >
      <Text style={styles.h1}>Olá, {firstName}!</Text>
      <Text style={styles.paragraph}>
        Seu período de acesso ao curso <strong>{courseName}</strong> está perto
        do fim. A partir de <strong>{expiresAtLabel}</strong> (em{" "}
        <strong>{daysLeft} dia(s)</strong>) o acesso aos conteúdos, à área do
        aluno e aos certificados vinculados a esta matrícula será encerrado.
      </Text>

      <Text style={styles.paragraph}>
        Se ainda não concluiu o curso, aproveite os próximos dias para finalizar
        as aulas e emitir o seu certificado.
      </Text>

      <Section style={styles.buttonRow}>
        <Button style={styles.primaryButton} href={studentPanelUrl}>
          Acessar minha área do aluno
        </Button>
      </Section>

      <Text style={styles.paragraphMuted}>
        Se o botão não funcionar, copie e cole no navegador:{" "}
        <a href={studentPanelUrl} style={styles.link}>
          {studentPanelUrl}
        </a>
      </Text>

      <Hr style={styles.hr} />

      <Text style={styles.paragraphMuted}>
        Qualquer dúvida sobre o seu acesso, responda este email que a gente te
        ajuda.
      </Text>
    </EmailLayout>
  )
}

AccessExpiringTemplate.PreviewProps = {
  studentName: "Beatriz Souza",
  courseName: "Auxiliar Administrativo",
  expiresAtLabel: "15/06/2026",
  daysLeft: 7,
  studentPanelUrl: "https://cursos-pro-joao.livrecursos.com.br/aluno",
  storeName: "Cursos Pro João",
} satisfies AccessExpiringTemplateProps

export default AccessExpiringTemplate
