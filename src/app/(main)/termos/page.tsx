import fs from "node:fs"
import path from "node:path"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { PageHero, PageBody, Prose } from "@/components/main/static/page-hero"

export const metadata = {
  title: "Termos de Uso — Profissionaliza Mais Brasil",
  description:
    "Termos e condições de uso da plataforma Profissionaliza Mais Brasil para alunos e visitantes.",
}

export default function TermosPage() {
  const file = path.join(process.cwd(), "docs/legal/TERMOS-DE-USO-ALUNO.md")
  const raw = fs.readFileSync(file, "utf-8")
  const body = raw.replace(/^# .+?\n/, "").trim()

  return (
    <>
      <PageHero
        eyebrow="Termos de uso"
        titulo="Termos e Condições de Uso — Alunos e Visitantes"
        subtitulo="Versão 1.1 — Atualizado em 21 de maio de 2026. Leia atentamente antes de adquirir qualquer curso."
      />
      <PageBody>
        <Prose>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
        </Prose>
      </PageBody>
    </>
  )
}
