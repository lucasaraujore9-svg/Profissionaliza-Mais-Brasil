import { Button, Hr, Section, Text } from "@react-email/components"
import { EmailLayout, styles } from "./_layout"
import type { EmailBrand } from "../brand"

export interface AccessExpiringTemplateProps {
  studentName: string
  courseName: string
  /** Data (já formatada, ex: "15/06/2026") em que o acesso será encerrado. */
  expiresAtLabel: string
  /** Dias restantes até o encerramento. `0` (ou menos) = acesso já encerrado. */
  daysLeft: number
  /** URL da área do aluno. */
  studentPanelUrl: string
  /** Marca da loja/revenda (cabeçalho, rodapé). Default: PMB. */
  brand?: EmailBrand
}

/**
 * Funil de avisos do fim do período de acesso de 12 meses (item 11 dos
 * aperfeiçoamentos). Disparado pelo cron `sweep-students-expired` nos marcos
 * 60/30/15/2 dias antes do fim e também "no dia da restrição" (daysLeft = 0,
 * quando o acesso já foi encerrado).
 */
export function AccessExpiringTemplate({
  studentName,
  courseName,
  expiresAtLabel,
  daysLeft,
  studentPanelUrl,
  brand,
}: AccessExpiringTemplateProps) {
  const firstName = studentName.split(" ")[0] || studentName
  const ended = daysLeft <= 0

  return (
    <EmailLayout
      preview={
        ended
          ? `Seu acesso a ${courseName} foi encerrado`
          : `Seu acesso a ${courseName} encerra em ${daysLeft} dia(s)`
      }
      brand={brand}
    >
      <Text style={styles.h1}>Olá, {firstName}!</Text>

      {ended ? (
        <>
          <Text style={styles.paragraph}>
            O período de acesso ao curso <strong>{courseName}</strong> chegou ao
            fim em <strong>{expiresAtLabel}</strong>. A partir de agora o acesso
            aos conteúdos e à área do aluno desta matrícula foi encerrado.
          </Text>
          <Text style={styles.paragraph}>
            Se precisar retomar os estudos ou tiver alguma dúvida sobre o seu
            acesso, fale com a gente — é só responder este email.
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.paragraph}>
            Seu período de acesso ao curso <strong>{courseName}</strong> está
            perto do fim. A partir de <strong>{expiresAtLabel}</strong> (em{" "}
            <strong>{daysLeft} dia(s)</strong>) o acesso aos conteúdos, à área do
            aluno e aos certificados vinculados a esta matrícula será encerrado.
          </Text>
          <Text style={styles.paragraph}>
            Se ainda não concluiu o curso, aproveite os próximos dias para
            finalizar as aulas e emitir o seu certificado.
          </Text>
        </>
      )}

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
  brand: {
    name: "Cursos Pro João",
    logoUrl: null,
    siteUrl: "https://cursos-pro-joao.livrecursos.com.br",
    siteLabel: "cursos-pro-joao.livrecursos.com.br",
    replyTo: null,
    isPmb: false,
  },
} satisfies AccessExpiringTemplateProps

export default AccessExpiringTemplate
