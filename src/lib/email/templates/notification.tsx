import { Button, Section, Text } from "@react-email/components"
import { EmailLayout, styles } from "./_layout"
import type { EmailBrand } from "../brand"

export interface NotificationTemplateProps {
  /** Título da notificação (vira o H1 e o preview). */
  title: string
  /** Corpo opcional (uma ou mais frases). */
  body?: string | null
  /** URL absoluta do CTA — abre a tela relevante (área do aluno/painel/admin). */
  ctaUrl?: string | null
  /** Rótulo do botão. Default: "Abrir". */
  ctaLabel?: string | null
  /** Marca da loja/revenda (header, rodapé). Default: PMB. */
  brand?: EmailBrand
}

/**
 * Template genérico para a ponte notificação→email: espelha por email uma
 * notificação in-app (título + corpo + CTA), com a marca da unidade. Usado por
 * `createNotification` quando a preferência de email está ligada para a
 * categoria. Não carrega dado sensível — só o texto já exibido in-app.
 */
export function NotificationTemplate({
  title,
  body,
  ctaUrl,
  ctaLabel,
  brand,
}: NotificationTemplateProps) {
  return (
    <EmailLayout preview={title} brand={brand}>
      <Text style={styles.h1}>{title}</Text>
      {body ? <Text style={styles.paragraph}>{body}</Text> : null}

      {ctaUrl ? (
        <>
          <Section style={styles.buttonRow}>
            <Button style={styles.primaryButton} href={ctaUrl}>
              {ctaLabel || "Abrir"}
            </Button>
          </Section>
          <Text style={styles.paragraphMuted}>
            Se o botão não funcionar, copie e cole no navegador:{" "}
            <a href={ctaUrl} style={styles.link}>
              {ctaUrl}
            </a>
          </Text>
        </>
      ) : null}

      <Text style={styles.paragraphMuted}>
        Você recebeu este aviso porque ele está ativo nas suas preferências de
        notificação. Dúvidas? Responda este email.
      </Text>
    </EmailLayout>
  )
}

NotificationTemplate.PreviewProps = {
  title: "Mensalidade 2/12 confirmada",
  body: "Pagamento de R$ 49,90 confirmado. Seu acesso segue liberado.",
  ctaUrl: "https://cursos-pro-joao.livrecursos.com.br/aluno/pagamentos",
  ctaLabel: "Ver meus pagamentos",
  brand: {
    name: "Cursos Pro João",
    logoUrl: null,
    siteUrl: "https://cursos-pro-joao.livrecursos.com.br",
    siteLabel: "cursos-pro-joao.livrecursos.com.br",
    replyTo: null,
    isPmb: false,
  },
} satisfies NotificationTemplateProps

export default NotificationTemplate
