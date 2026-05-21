import fs from "node:fs"
import path from "node:path"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { PageHero, PageBody, Prose } from "@/components/main/static/page-hero"

export const metadata = {
  title: "Contrato de Revenda — Profissionaliza Mais Brasil",
  description:
    "Contrato de licenciamento de uso da plataforma e revenda de cursos profissionalizantes Profissionaliza Mais Brasil.",
}

export default function ContratoRevendaPage() {
  const file = path.join(process.cwd(), "docs/legal/CONTRATO-DE-REVENDA.md")
  const raw = fs.readFileSync(file, "utf-8")
  const body = raw.replace(/^# .+?\n/, "").trim()

  return (
    <>
      <PageHero
        eyebrow="Contrato de revenda"
        titulo="Contrato de Licenciamento e Revenda de Cursos"
        subtitulo="Versão 1.0 — Atualizado em 20 de maio de 2026. Documento aplicável a Unidades e Consultores parceiros."
      />
      <PageBody>
        <Prose>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
        </Prose>
      </PageBody>
    </>
  )
}
