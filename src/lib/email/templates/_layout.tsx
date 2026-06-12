import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components"
import type { ReactNode } from "react"
import { PMB_EMAIL_BRAND, type EmailBrand } from "../brand"

export interface EmailLayoutProps {
  preview: string
  /**
   * Identidade de marca do email. Default: Profissionaliza Mais Brasil. Em
   * emails de uma revenda, passe a marca da unidade — nunca caímos em logo,
   * nome ou domínio da PMB nesse caso.
   */
  brand?: EmailBrand
  /** Conteúdo principal do email (sections, parágrafos etc.). */
  children: ReactNode
}

export function EmailLayout({
  preview,
  brand = PMB_EMAIL_BRAND,
  children,
}: EmailLayoutProps) {
  return (
    <Html lang="pt-BR">
      <Head>
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={outer}>
          <Section style={headerSection}>
            {brand.logoUrl ? (
              <Img
                src={brand.logoUrl}
                alt={brand.name}
                width="160"
                height="48"
                style={logoStyle}
              />
            ) : (
              <Text style={wordmark}>{brand.name}</Text>
            )}
          </Section>

          <Container style={card}>{children}</Container>

          <Section style={footerSection}>
            <Hr style={footerHr} />
            <Text style={footerBrand}>{brand.name}</Text>
            <Text style={footerLine}>
              Cursos profissionalizantes para quem quer crescer.
            </Text>
            <Text style={footerLine}>
              Dúvidas? Responda este email — a gente lê e responde por aqui.
            </Text>
            {brand.siteUrl && brand.siteLabel ? (
              <Text style={footerMeta}>
                <Link href={brand.siteUrl} style={footerLink}>
                  {brand.siteLabel}
                </Link>
              </Text>
            ) : null}
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

// ── Estilos compartilhados ─────────────────────────────────────────────────

export const styles = {
  h1: {
    color: "#025918",
    fontSize: "26px",
    fontWeight: 800 as const,
    lineHeight: 1.25,
    margin: "0 0 16px",
  },
  h2: {
    color: "#025918",
    fontSize: "18px",
    fontWeight: 700 as const,
    lineHeight: 1.3,
    margin: "24px 0 12px",
  },
  paragraph: {
    color: "#1A1A2E",
    fontSize: "15px",
    lineHeight: 1.65,
    margin: "0 0 14px",
  },
  paragraphMuted: {
    color: "#4B5563",
    fontSize: "13px",
    lineHeight: 1.55,
    margin: "0 0 12px",
  },
  primaryButton: {
    backgroundColor: "#025918",
    borderRadius: "10px",
    color: "#FFFFFF",
    fontSize: "15px",
    fontWeight: 700 as const,
    textDecoration: "none",
    textAlign: "center" as const,
    padding: "13px 28px",
    display: "inline-block",
  },
  accentButton: {
    backgroundColor: "#F2B705",
    borderRadius: "10px",
    color: "#025918",
    fontSize: "15px",
    fontWeight: 800 as const,
    textDecoration: "none",
    textAlign: "center" as const,
    padding: "13px 28px",
    display: "inline-block",
  },
  outlineButton: {
    backgroundColor: "#FFFFFF",
    border: "1.5px solid #025918",
    borderRadius: "10px",
    color: "#025918",
    fontSize: "14px",
    fontWeight: 700 as const,
    textDecoration: "none",
    textAlign: "center" as const,
    padding: "10px 22px",
    display: "inline-block",
  },
  buttonRow: {
    textAlign: "center" as const,
    margin: "26px 0",
  },
  hr: {
    border: "none",
    borderTop: "1px solid #E5E7EB",
    margin: "24px 0",
  },
  link: {
    color: "#025918",
    textDecoration: "underline",
  },
  credentialBox: {
    backgroundColor: "#F0FDF4",
    border: "1px solid #BBF7D0",
    borderRadius: "12px",
    padding: "18px 20px",
    margin: "20px 0",
  },
  credentialLabel: {
    color: "#025918",
    fontSize: "11px",
    fontWeight: 800 as const,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    margin: "0 0 4px",
  },
  credentialValue: {
    color: "#1A1A2E",
    fontSize: "15px",
    fontWeight: 600 as const,
    margin: "0 0 12px",
  },
  credentialValueMono: {
    color: "#1A1A2E",
    fontSize: "15px",
    fontWeight: 700 as const,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
    backgroundColor: "#FFFFFF",
    border: "1px solid #BBF7D0",
    borderRadius: "6px",
    padding: "8px 12px",
    margin: "0 0 12px",
    display: "inline-block",
  },
  credentialHint: {
    color: "#4B5563",
    fontSize: "12px",
    lineHeight: 1.5,
    margin: "8px 0 0",
  },
  detailsBox: {
    backgroundColor: "#F4F6F8",
    borderRadius: "12px",
    padding: "18px 20px",
    margin: "16px 0",
  },
  detailRow: {
    color: "#1A1A2E",
    fontSize: "14px",
    lineHeight: 1.55,
    margin: "0 0 6px",
  },
  highlightBox: {
    backgroundColor: "#F0FDF4",
    border: "1px solid #C0D904",
    borderRadius: "12px",
    padding: "20px",
    margin: "20px 0",
    textAlign: "center" as const,
  },
  highlightLabel: {
    color: "#025918",
    fontSize: "12px",
    fontWeight: 800 as const,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    margin: "0 0 6px",
  },
  highlightValue: {
    color: "#025918",
    fontSize: "30px",
    fontWeight: 900 as const,
    lineHeight: 1.2,
    margin: "0 0 10px",
  },
  step: {
    color: "#1A1A2E",
    fontSize: "14px",
    lineHeight: 1.7,
    margin: "0 0 4px",
  },
} as const

// ── Estilos do layout externo ──────────────────────────────────────────────

const body = {
  backgroundColor: "#F4F6F8",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  margin: 0,
  padding: 0,
}

const outer = {
  margin: "0 auto",
  padding: "24px 16px 32px",
  maxWidth: "600px",
}

const headerSection = {
  padding: "8px 0 20px",
  textAlign: "center" as const,
}

const logoStyle = {
  display: "inline-block",
  height: "auto",
  maxWidth: "180px",
}

// Fallback textual quando a unidade não tem logo cadastrada — evita exibir a
// logo da PMB numa vitrine de revenda.
const wordmark = {
  color: "#025918",
  fontSize: "22px",
  fontWeight: 800 as const,
  letterSpacing: "-0.01em",
  margin: 0,
}

const card = {
  backgroundColor: "#FFFFFF",
  borderRadius: "14px",
  padding: "32px",
  boxShadow: "0 1px 2px rgba(2, 89, 24, 0.04)",
}

const footerSection = {
  padding: "20px 8px 0",
  textAlign: "center" as const,
}

const footerHr = {
  border: "none",
  borderTop: "1px solid #E5E7EB",
  margin: "0 0 16px",
}

const footerBrand = {
  color: "#025918",
  fontSize: "13px",
  fontWeight: 700 as const,
  margin: "0 0 4px",
}

const footerLine = {
  color: "#6B7280",
  fontSize: "12px",
  lineHeight: 1.5,
  margin: "0 0 4px",
}

const footerMeta = {
  color: "#9CA3AF",
  fontSize: "11px",
  margin: "10px 0 0",
}

const footerLink = {
  color: "#025918",
  textDecoration: "none",
  fontWeight: 600 as const,
}
