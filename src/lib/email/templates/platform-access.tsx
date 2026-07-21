import { Button, Hr, Section, Text } from "@react-email/components"
import { EmailLayout, styles } from "./_layout"
import type { EmailBrand } from "../brand"

export interface PlatformAccessTemplateProps {
  studentName: string
  /** Usuário do aluno na plataforma de aulas (EA: ea_aluno_id). */
  login: string
  /** URL da área do aluno (Sistema Acadêmico) — é lá que a senha fica visível. */
  studentPanelUrl: string
  /** URL da tela de login da plataforma de aulas. `null` esconde o botão. */
  loginUrl?: string | null
  brand?: EmailBrand
}

/**
 * "Seus dados de acesso à plataforma de aulas" — disparado pelo próprio aluno
 * quando não consegue entrar.
 *
 * Existe porque a plataforma de aulas (Escola Avançada) não tem recuperação de
 * senha automatizada: o "Esqueci minha senha" da tela de login dela abre um
 * atendimento por WhatsApp do fornecedor, e a API v2 não expõe troca de senha
 * de aluno. A recuperação self-service, portanto, é nossa — e o caminho é a
 * área do aluno.
 *
 * LGPD-012: a senha NÃO vai no corpo do e-mail (canal não é fim-a-fim seguro).
 * Mandamos o usuário e o caminho até ela, que fica na área do aluno atrás de
 * login — e o acesso à área do aluno o próprio aluno recupera por e-mail.
 */
export function PlatformAccessTemplate({
  studentName,
  login,
  studentPanelUrl,
  loginUrl,
  brand,
}: PlatformAccessTemplateProps) {
  const firstName = studentName.split(" ")[0] || studentName

  return (
    <EmailLayout
      preview="Seus dados de acesso à plataforma de aulas"
      brand={brand}
    >
      <Text style={styles.h1}>Seu acesso às aulas, {firstName}</Text>
      <Text style={styles.paragraph}>
        Você pediu os seus dados de acesso à{" "}
        <strong>plataforma de aulas</strong> — onde ficam os vídeos e as
        atividades. Aqui está o seu usuário:
      </Text>

      <Section style={styles.credentialBox}>
        <Text style={styles.credentialLabel}>
          🏫 Plataforma de aulas — seu usuário
        </Text>
        <Text style={styles.credentialValueMono}>{login}</Text>
        <Text style={styles.credentialHint}>
          Por segurança, não enviamos senha por e-mail. Sua senha atual fica na
          sua área do aluno, no card{" "}
          <strong>acesso à plataforma de aulas</strong> — é só clicar em mostrar
          e copiar.
        </Text>
        <Section style={styles.buttonRow}>
          <Button style={styles.primaryButton} href={studentPanelUrl}>
            Ver minha senha na área do aluno
          </Button>
        </Section>
      </Section>

      <Hr style={styles.hr} />

      <Text style={styles.paragraph}>
        Sempre que precisar da senha, ela está na sua área do aluno — é o jeito
        mais rápido. Na tela da plataforma de aulas, o “Esqueci minha senha”
        abre um atendimento por WhatsApp, caso prefira falar com alguém.
      </Text>

      {loginUrl ? (
        <>
          <Text style={styles.step}>
            1. Copie o usuário e a senha na sua área do aluno.
          </Text>
          <Text style={styles.step}>
            2. Entre na plataforma de aulas com eles.
          </Text>
          <Section style={styles.buttonRow}>
            <Button style={styles.accentButton} href={loginUrl}>
              Ir para a plataforma de aulas
            </Button>
          </Section>
        </>
      ) : null}

      <Text style={styles.paragraph}>
        Se ainda assim não conseguir entrar, responda este e-mail que a gente
        resolve para você.
      </Text>
    </EmailLayout>
  )
}
