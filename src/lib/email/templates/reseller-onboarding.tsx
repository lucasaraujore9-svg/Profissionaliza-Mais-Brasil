import { Button, Hr, Section, Text } from "@react-email/components"
import { EmailLayout, styles } from "./_layout"

export interface ResellerOnboardingTemplateProps {
  ownerName: string
  resellerName: string
  loginEmail: string
  tempPassword: string
  loginUrl: string
  vitrineUrl: string
  paymentUrl: string | null
  planValue: number
}

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

export function ResellerOnboardingTemplate({
  ownerName,
  resellerName,
  loginEmail,
  tempPassword,
  loginUrl,
  vitrineUrl,
  paymentUrl,
  planValue,
}: ResellerOnboardingTemplateProps) {
  const planFormatted = formatBRL(planValue)

  return (
    <EmailLayout
      preview={
        paymentUrl
          ? `Sua revenda ${resellerName} foi criada — finalize a primeira mensalidade`
          : `Sua revenda ${resellerName} foi criada — pagamento pendente`
      }
    >
      <Text style={styles.h1}>Bem-vindo(a), {ownerName}!</Text>
      <Text style={styles.paragraph}>
        Sua revenda <strong>{resellerName}</strong> foi cadastrada no
        Profissionaliza Mais Brasil. Falta só um passo para ativar sua vitrine
        e começar a vender.
      </Text>

      {paymentUrl && (
        <>
          <Section style={styles.highlightBox}>
            <Text style={styles.highlightLabel}>Primeira mensalidade</Text>
            <Text style={styles.highlightValue}>{planFormatted}</Text>
            <Text style={styles.paragraphMuted}>
              Pague no Pix, boleto ou cartão. Assim que o pagamento for
              confirmado, sua vitrine entra no ar automaticamente.
            </Text>
            <Button style={styles.accentButton} href={paymentUrl}>
              Pagar primeira mensalidade
            </Button>
          </Section>

          <Hr style={styles.hr} />
        </>
      )}

      <Section>
        <Text style={styles.h2}>Suas credenciais de acesso</Text>
        <Text style={styles.paragraph}>
          Use os dados abaixo para entrar no painel administrativo da sua
          revenda. <strong>Troque sua senha logo no primeiro acesso.</strong>
        </Text>

        <Section style={styles.credentialBox}>
          <Text style={styles.credentialLabel}>Email</Text>
          <Text style={styles.credentialValue}>{loginEmail}</Text>

          <Text style={styles.credentialLabel}>Senha temporária</Text>
          <Text style={styles.credentialValueMono}>{tempPassword}</Text>
        </Section>

        <Section style={{ textAlign: "center" as const, margin: "8px 0 0" }}>
          <Button style={styles.outlineButton} href={loginUrl}>
            Acessar painel
          </Button>
        </Section>
      </Section>

      <Hr style={styles.hr} />

      <Section>
        <Text style={styles.h2}>Sua vitrine</Text>
        <Text style={styles.paragraph}>
          Esse é o endereço que seus alunos vão acessar:
        </Text>
        <Text style={styles.credentialValue}>
          <a href={vitrineUrl} style={styles.link}>
            {vitrineUrl}
          </a>
        </Text>
        <Text style={styles.paragraphMuted}>
          A vitrine fica visível assim que o pagamento da primeira mensalidade
          for confirmado. Depois disso, você pode até conectar um domínio
          próprio.
        </Text>
      </Section>

      <Hr style={styles.hr} />

      <Section>
        <Text style={styles.h2}>Próximos passos depois do pagamento</Text>
        <Text style={styles.step}>
          1. Personalize sua vitrine: logo, cores, banner e textos.
        </Text>
        <Text style={styles.step}>
          2. Conecte sua conta Mercado Pago para receber pagamentos dos alunos.
        </Text>
        <Text style={styles.step}>
          3. Ajuste preços e visibilidade dos cursos.
        </Text>
        <Text style={styles.step}>
          4. Compartilhe sua vitrine nas redes sociais e no WhatsApp.
        </Text>
      </Section>

      <Text style={styles.paragraphMuted}>
        Qualquer dúvida, é só responder este email — a gente atende por aqui
        mesmo.
      </Text>
    </EmailLayout>
  )
}

ResellerOnboardingTemplate.PreviewProps = {
  ownerName: "João Pereira",
  resellerName: "Cursos Pro João",
  loginEmail: "joao@cursospro.com.br",
  tempPassword: "Pmb#2026Tmp",
  loginUrl: "https://profissionalizamaisbrasil.com.br/login",
  vitrineUrl: "https://cursos-pro-joao.livrecursos.com.br",
  paymentUrl: "https://www.asaas.com/c/abc123def456",
  planValue: 197,
} satisfies ResellerOnboardingTemplateProps

export default ResellerOnboardingTemplate
