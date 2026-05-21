import fs from "node:fs"
import path from "node:path"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { PageHero, PageBody, Prose } from "@/components/main/static/page-hero"

export const metadata = {
  title: "Política de Privacidade — Profissionaliza Mais Brasil",
  description:
    "Como coletamos, usamos e protegemos seus dados pessoais — em conformidade com a LGPD (Lei nº 13.709/2018).",
}

export default function PrivacidadePage() {
  const file = path.join(process.cwd(), "docs/legal/POLITICA-DE-PRIVACIDADE.md")
  const raw = fs.readFileSync(file, "utf-8")
  const body = raw.replace(/^# .+?\n/, "").trim()

  return (
    <>
      <PageHero
        eyebrow="Política de Privacidade"
        titulo="Política de Privacidade e Segurança de Dados"
        subtitulo="Versão 1.1 — Atualizada em 21 de maio de 2026. Em conformidade com a LGPD, o Marco Civil da Internet e o CDC."
      />
      <PageBody>
        <Prose>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
        </Prose>
      </PageBody>
    </>
  )
}
