import fs from "node:fs"
import path from "node:path"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { PageHero, PageBody, Prose } from "@/components/main/static/page-hero"
import { LegalTenantNotice } from "@/components/main/static/legal-tenant-notice"
import { getCurrentTenant } from "@/lib/tenant/current"
import { LEGAL_VERSION, PRIVACY_UPDATED_AT } from "@/lib/legal/version"

export const metadata = {
  title: "Política de Privacidade",
  description:
    "Como coletamos, usamos e protegemos seus dados pessoais — em conformidade com a LGPD (Lei nº 13.709/2018).",
}

export default async function PrivacidadePage() {
  const file = path.join(process.cwd(), "docs/legal/POLITICA-DE-PRIVACIDADE.md")
  const raw = fs.readFileSync(file, "utf-8")
  const body = raw.replace(/^# .+?\n/, "").trim()

  // Tenant-aware: numa vitrine de revendedor, deixamos explícito o papel da loja
  // como Controladora e do PMB como Operador (a Política já descreve isso). No
  // site PMB, segue institucional.
  const tenant = await getCurrentTenant()

  return (
    <>
      <PageHero
        eyebrow="Política de Privacidade"
        titulo={
          tenant
            ? `Política de Privacidade — ${tenant.name}`
            : "Política de Privacidade e Segurança de Dados"
        }
        subtitulo={`Versão ${LEGAL_VERSION} — Atualizada em ${PRIVACY_UPDATED_AT}. Em conformidade com a LGPD, o Marco Civil da Internet e o CDC.`}
      />
      <PageBody>
        {tenant && (
          <LegalTenantNotice tenantName={tenant.name} kind="privacidade" />
        )}
        <Prose>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
        </Prose>
      </PageBody>
    </>
  )
}
