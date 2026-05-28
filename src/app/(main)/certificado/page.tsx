import Link from "next/link"
import { Award, Download, Share2, Shield } from "lucide-react"
import { PageHero, PageBody } from "@/components/main/static/page-hero"

export const metadata = {
  title: "Certificado — Profissionaliza Mais Brasil",
  description: "Como acessar, baixar e validar seu certificado de conclusão.",
}

export default function CertificadoPage() {
  return (
    <>
      <PageHero
        eyebrow="Certificado"
        titulo="Seu certificado, reconhecido nacionalmente"
        subtitulo="Curso livre conforme Decreto 5.154/2004. Com carga horária, assinatura digital e QR Code de validação."
      />
      <PageBody>
        <div className="grid gap-4 md:grid-cols-2">
          {[
            {
              icon: Award,
              titulo: "Como emitir",
              texto: "Ao concluir 100% das aulas do seu curso, o botão de emissão fica disponível diretamente na plataforma de estudos. O PDF é gerado instantaneamente.",
            },
            {
              icon: Download,
              titulo: "Como baixar",
              texto: "Baixe o arquivo em PDF (alta qualidade, pronto para impressão) ou em PNG para suas redes sociais. Todos os certificados ficam salvos na sua área de aluno.",
            },
            {
              icon: Shield,
              titulo: "Como validar",
              texto: "Cada certificado tem um código único e QR Code. Quem quiser confirmar a autenticidade escaneia e vê os dados validados em nosso sistema.",
            },
            {
              icon: Share2,
              titulo: "Como compartilhar",
              texto: "Adicione seu certificado no LinkedIn, anexe em currículos, ou compartilhe nas redes sociais. Valorize suas conquistas profissionais.",
            },
          ].map((b) => (
            <div key={b.titulo} className="rounded-xl border border-[rgba(2,89,24,0.08)] bg-white p-6">
              <b.icon className="h-9 w-9 text-[var(--color-pmb-gold-600)]" strokeWidth={2} aria-hidden />
              <h2 className="mt-4 text-[17px] font-black text-[var(--color-pmb-green)]">{b.titulo}</h2>
              <p className="mt-2 text-[13.5px] leading-relaxed text-[rgba(2,89,24,0.75)]">{b.texto}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-xl border border-[rgba(2,89,24,0.08)] bg-white p-6 md:p-8">
          <h2 className="text-[20px] font-black text-[var(--color-pmb-green)]">Acessar meu certificado</h2>
          <p className="mt-2 text-[14px] text-[rgba(2,89,24,0.75)]">
            Entre na plataforma de estudos com seu email e senha. Na aba <strong>Meus Cursos</strong>,
            clique no curso concluído → <strong>Emitir certificado</strong>.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="rounded-lg bg-[var(--color-pmb-gold)] px-5 py-3 text-[14px] font-black text-[var(--color-pmb-green)]"
            >
              Entrar na plataforma
            </Link>
            <Link
              href="/ajuda"
              className="rounded-lg border border-[rgba(2,89,24,0.15)] px-5 py-3 text-[14px] font-black text-[var(--color-pmb-green)] hover:border-[var(--color-pmb-green)]"
            >
              Tirar dúvidas
            </Link>
          </div>
        </div>
      </PageBody>
    </>
  )
}
