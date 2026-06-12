import { Button, Hr, Section, Text } from "@react-email/components"
import { EmailLayout, styles } from "./_layout"
import type { EmailBrand } from "../brand"

export interface AccountCredentialsTemplateProps {
  userName: string
  /** Nome da equipe/contexto, ex: "Equipe PMB" ou o nome da revenda. */
  contextLabel: string
  /** Papel/cargo legível, ex: "Vendas PMB" ou "Consultor". */
  roleLabel?: string
  loginEmail: string
  tempPassword: string
  loginUrl: string
  /** Marca da unidade — sem isso o header cai na marca institucional PMB. */
  brand?: EmailBrand
}

export function AccountCredentialsTemplate({
  userName,
  contextLabel,
  roleLabel,
  loginEmail,
  tempPassword,
  loginUrl,
  brand,
}: AccountCredentialsTemplateProps) {
  return (
    <EmailLayout preview={`Seu acesso a ${contextLabel} foi criado`} brand={brand}>
      <Text style={styles.h1}>Bem-vindo(a), {userName}!</Text>
      <Text style={styles.paragraph}>
        Sua conta de acesso a <strong>{contextLabel}</strong>
        {roleLabel ? (
          <>
            {" "}
            como <strong>{roleLabel}</strong>
          </>
        ) : null}{" "}
        foi criada. Use as credenciais abaixo para entrar.
      </Text>

      <Section>
        <Text style={styles.h2}>Suas credenciais de acesso</Text>
        <Text style={styles.paragraph}>
          <strong>Troque sua senha logo no primeiro acesso.</strong>
        </Text>

        <Section style={styles.credentialBox}>
          <Text style={styles.credentialLabel}>Email</Text>
          <Text style={styles.credentialValue}>{loginEmail}</Text>

          <Text style={styles.credentialLabel}>Senha temporária</Text>
          <Text style={styles.credentialValueMono}>{tempPassword}</Text>
        </Section>

        <Section style={{ textAlign: "center" as const, margin: "8px 0 0" }}>
          <Button style={styles.accentButton} href={loginUrl}>
            Acessar agora
          </Button>
        </Section>
      </Section>

      <Hr style={styles.hr} />

      <Text style={styles.paragraphMuted}>
        Por segurança, ao entrar pela primeira vez você será solicitado(a) a
        definir uma nova senha pessoal. Se você não esperava este email, ignore-o.
      </Text>
    </EmailLayout>
  )
}

AccountCredentialsTemplate.PreviewProps = {
  userName: "Maria Silva",
  contextLabel: "Equipe PMB",
  roleLabel: "Vendas PMB",
  loginEmail: "maria@pmb.com.br",
  tempPassword: "Pmb#2026Tmp",
  loginUrl: "https://profissionalizamaisbrasil.com.br/login",
} satisfies AccountCredentialsTemplateProps

export default AccountCredentialsTemplate
