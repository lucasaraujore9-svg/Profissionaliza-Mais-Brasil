import { Button, Hr, Section, Text } from "@react-email/components"
import { EmailLayout, styles } from "./_layout"
import type { EmailBrand } from "../brand"

/** Credenciais da plataforma de aulas (EA ou LMS) entregues no email. */
export interface EnrollmentSchoolAccess {
  /** Usuário/login na plataforma de aulas (EA: ea_aluno_id; LMS: login do parceiro). */
  login: string
  /**
   * Senha inicial em texto puro — só populada quando temos o valor (1ª criação).
   * null = usar a senha recebida à parte (e-mail da plataforma) ou a já em uso.
   */
  password?: string | null
  /** URL de login da plataforma (EA) ou portal do parceiro (LMS). null = acessar via área do aluno. */
  loginUrl?: string | null
}

export interface EnrollmentTemplateProps {
  studentName: string
  /** Login do Sistema Acadêmico (área do aluno): o e-mail do aluno. */
  studentEmail?: string
  courseName: string
  /** URL do painel do aluno (Sistema Acadêmico — sua área dentro do sistema da revenda/PMB). */
  studentPanelUrl: string
  /**
   * true  = aluno novo (1ª compra) → "matrícula confirmada".
   * false = aluno antigo comprando um curso novo → "novo curso liberado".
   */
  isNewStudent?: boolean
  /**
   * Credenciais da Plataforma da Escola (EA ou LMS). Quando ausente, o email
   * orienta o acesso pela área do aluno.
   */
  school?: EnrollmentSchoolAccess | null
  /** Marca da loja/revenda (header, rodapé). Default: PMB. */
  brand?: EmailBrand
}

export function EnrollmentTemplate({
  studentName,
  studentEmail,
  courseName,
  studentPanelUrl,
  isNewStudent = true,
  school,
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
            já está liberada.
          </>
        ) : (
          <>
            Você acaba de adquirir o curso <strong>{courseName}</strong> e ele já
            está liberado, junto dos seus outros cursos.
          </>
        )}
      </Text>

      <Text style={styles.paragraph}>
        Para estudar, você usa <strong>duas plataformas</strong>: o{" "}
        <strong>Sistema Acadêmico</strong> (a sua área do aluno, onde ficam
        matrículas, progresso e certificados) e a{" "}
        <strong>Plataforma da Escola</strong> (onde ficam os vídeos e as
        atividades das aulas). Veja abaixo como entrar em cada uma.
      </Text>

      <Hr style={styles.hr} />

      {/* 1) Sistema Acadêmico — área do aluno (PMB / revenda) */}
      <Section style={styles.credentialBox}>
        <Text style={styles.credentialLabel}>
          🎓 Sistema Acadêmico — sua área do aluno
        </Text>
        <Text style={styles.detailRow}>Acesse em:</Text>
        <Text style={styles.credentialValueMono}>{studentPanelUrl}</Text>
        {studentEmail ? (
          <Text style={styles.detailRow}>
            Login: <strong>{studentEmail}</strong>
          </Text>
        ) : null}
        <Text style={styles.credentialHint}>
          Senha: a que você definiu ou recebeu no e-mail de boas-vindas. É aqui
          que você acompanha matrículas e pagamentos e baixa os certificados.
        </Text>
        <Section style={styles.buttonRow}>
          <Button style={styles.primaryButton} href={studentPanelUrl}>
            Ir para minha área do aluno
          </Button>
        </Section>
      </Section>

      {/* 2) Plataforma da Escola — onde ficam as aulas (EA ou LMS) */}
      <Section style={styles.credentialBox}>
        <Text style={styles.credentialLabel}>
          🏫 Plataforma da Escola — onde ficam as aulas
        </Text>
        {school?.login ? (
          <>
            <Text style={styles.detailRow}>Usuário:</Text>
            <Text style={styles.credentialValueMono}>{school.login}</Text>
            {school.password ? (
              <>
                <Text style={styles.detailRow}>Senha:</Text>
                <Text style={styles.credentialValueMono}>{school.password}</Text>
              </>
            ) : (
              <Text style={styles.credentialHint}>
                Senha: a que você recebeu por e-mail da plataforma de aulas (ou a
                que você já usa).
              </Text>
            )}
            {school.loginUrl ? (
              <Section style={styles.buttonRow}>
                <Button style={styles.accentButton} href={school.loginUrl}>
                  Acessar a plataforma de aulas
                </Button>
              </Section>
            ) : (
              <Text style={styles.credentialHint}>
                Para assistir, entre na sua área do aluno, abra{" "}
                <strong>{courseName}</strong> e clique em{" "}
                <strong>acessar a plataforma de aulas</strong>.
              </Text>
            )}
          </>
        ) : (
          <>
            <Text style={styles.step}>
              1. Entre na sua área do aluno (acima) com o seu e-mail e senha.
            </Text>
            <Text style={styles.step}>
              2. Abra <strong>{courseName}</strong> e clique em{" "}
              <strong>acessar a plataforma de aulas</strong>.
            </Text>
            <Text style={styles.step}>
              3. É na plataforma de aulas que ficam os vídeos e as atividades —
              seu progresso volta para a área do aluno.
            </Text>
          </>
        )}
      </Section>

      <Text style={styles.paragraphMuted}>
        Bons estudos! Qualquer dúvida, responda este email que a gente te ajuda.
      </Text>
    </EmailLayout>
  )
}

EnrollmentTemplate.PreviewProps = {
  studentName: "Beatriz Souza",
  studentEmail: "beatriz@email.com",
  courseName: "Auxiliar Administrativo",
  studentPanelUrl: "https://cursos-pro-joao.livrecursos.com.br/aluno",
  isNewStudent: true,
  school: {
    login: "12345",
    password: "mrmc3112",
    loginUrl: "https://playcurso.com/bolsamaisbrasil/metodo/login.php",
  },
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
