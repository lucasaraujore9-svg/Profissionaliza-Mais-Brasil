import fs from "node:fs"
import path from "node:path"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { PageHero, PageBody, Prose } from "@/components/main/static/page-hero"
import { LegalTenantNotice } from "@/components/main/static/legal-tenant-notice"
import { getCurrentTenant } from "@/lib/tenant/current"
import { LEGAL_VERSION, TERMS_UPDATED_AT } from "@/lib/legal/version"

export const metadata = {
  title: "Termos de Uso",
  description:
    "Termos e condições de uso da plataforma Profissionaliza Mais Brasil para alunos e visitantes.",
}

export default async function TermosPage() {
  const file = path.join(process.cwd(), "docs/legal/TERMOS-DE-USO-ALUNO.md")
  const raw = fs.readFileSync(file, "utf-8")
  const body = raw.replace(/^# .+?\n/, "").trim()

  // Tenant-aware: numa vitrine de revendedor, o hero e um aviso de topo
  // reenquadram o documento para a loja em questão (o corpo legal já trata a
  // "Unidade" genericamente). No site PMB, segue institucional.
  const tenant = await getCurrentTenant()

  return (
    <>
      <PageHero
        eyebrow="Termos de uso"
        titulo={
          tenant
            ? `Termos e Condições de Uso — ${tenant.name}`
            : "Termos e Condições de Uso — Alunos e Visitantes"
        }
        subtitulo={`Versão ${LEGAL_VERSION} — Atualizado em ${TERMS_UPDATED_AT}. Leia atentamente antes de adquirir qualquer curso.`}
      />
      <PageBody>
        {tenant && <LegalTenantNotice tenantName={tenant.name} kind="termos" />}
        <Prose>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
        </Prose>
      </PageBody>
    </>
  )
}
