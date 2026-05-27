import { Button, Section, Text } from "@react-email/components"
import { EmailLayout, styles } from "./_layout"

export interface WelcomeTemplateProps {
  resellerName: string
  loginUrl: string
  panelUrl: string
}

export function WelcomeTemplate({
  resellerName,
  loginUrl,
  panelUrl,
}: WelcomeTemplateProps) {
  return (
    <EmailLayout preview={`Bem-vindo(a), ${resellerName} — sua revenda foi ativada`}>
      <Text style={styles.h1}>Bem-vindo(a), {resellerName}!</Text>
      <Text style={styles.paragraph}>
        Sua revenda no Profissionaliza Mais Brasil está pronta. Em poucos passos
        você terá uma vitrine própria, com seu domínio e seus cursos no ar.
      </Text>

      <Section>
        <Text style={styles.h2}>Roteiro rápido</Text>
        <Text style={styles.step}>1. Personalize sua vitrine: logo, cores e banner.</Text>
        <Text style={styles.step}>2. Conecte sua conta Mercado Pago para receber os pagamentos.</Text>
        <Text style={styles.step}>3. Selecione e ajuste os cursos que você quer vender.</Text>
        <Text style={styles.step}>4. Compartilhe o link da sua vitrine com seus clientes.</Text>
      </Section>

      <Section style={styles.buttonRow}>
        <Button style={styles.primaryButton} href={panelUrl}>
          Acessar meu painel
        </Button>
      </Section>

      <Text style={styles.paragraphMuted}>
        Se o botão não funcionar, copie e cole no navegador:{" "}
        <a href={loginUrl} style={styles.link}>
          {loginUrl}
        </a>
        .
      </Text>
    </EmailLayout>
  )
}

WelcomeTemplate.PreviewProps = {
  resellerName: "Maria Silva",
  loginUrl: "https://profissionalizamaisbrasil.com.br/login",
  panelUrl: "https://profissionalizamaisbrasil.com.br/painel",
} satisfies WelcomeTemplateProps

export default WelcomeTemplate
