import { Button, Section, Text } from "@react-email/components"
import { EmailLayout, styles } from "./_layout"

export interface InviteTemplateProps {
  userName: string
  inviterName: string
  role: string
  inviteUrl: string
  expirationDays: number
  context?: "pmb_team" | "reseller_consultant"
  tenantName?: string
}

const roleLabel: Record<string, string> = {
  SUPER_ADMIN: "Super Administrador",
  PMB_SALES: "Equipe de Vendas",
  PMB_RESELLER_MGR: "Gerente de Revendedores",
  consultant: "Consultor(a) de vendas",
  RESELLER: "Revendedor(a)",
}

export function InviteTemplate({
  userName,
  inviterName,
  role,
  inviteUrl,
  expirationDays,
  context = "pmb_team",
  tenantName,
}: InviteTemplateProps) {
  const label = roleLabel[role] ?? role
  const isReseller = context === "reseller_consultant" && tenantName
  const headline = isReseller
    ? `Você foi convidado(a) para a equipe de ${tenantName}`
    : "Você foi convidado(a) para a equipe Profissionaliza Mais Brasil"

  const brandName = isReseller ? tenantName! : "Profissionaliza Mais Brasil"
  const brandTagline = isReseller ? "via Profissionaliza Mais Brasil" : undefined

  return (
    <EmailLayout
      preview={`${inviterName} te convidou para fazer parte da equipe`}
      brandName={brandName}
      brandTagline={brandTagline}
    >
      <Text style={styles.h1}>{headline}</Text>
      <Text style={styles.paragraph}>Olá, {userName}.</Text>
      <Text style={styles.paragraph}>
        <strong>{inviterName}</strong> te convidou para atuar como{" "}
        <strong>{label}</strong>
        {isReseller ? ` em ${tenantName}` : ""}.
      </Text>
      <Text style={styles.paragraph}>
        Clique no botão abaixo para definir sua senha e acessar o painel. O
        convite expira em <strong>{expirationDays} dias</strong>.
      </Text>

      <Section style={styles.buttonRow}>
        <Button style={styles.primaryButton} href={inviteUrl}>
          Aceitar convite e definir senha
        </Button>
      </Section>

      <Text style={styles.paragraphMuted}>
        Se o botão não funcionar, copie e cole no navegador:{" "}
        <a href={inviteUrl} style={styles.link}>
          {inviteUrl}
        </a>
      </Text>

      <Text style={styles.paragraphMuted}>
        Não esperava este convite? Pode ignorar este email — ele perde a validade
        automaticamente.
      </Text>
    </EmailLayout>
  )
}

InviteTemplate.PreviewProps = {
  userName: "Ana Costa",
  inviterName: "Lucas Araujo",
  role: "PMB_SALES",
  inviteUrl: "https://profissionalizamaisbrasil.com.br/reset-password?token=abc123&invite=1",
  expirationDays: 7,
  context: "pmb_team",
} satisfies InviteTemplateProps

export default InviteTemplate
