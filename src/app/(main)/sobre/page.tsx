import Link from "next/link"
import { Target, Users, TrendingUp } from "lucide-react"
import { PageHero, PageBody } from "@/components/main/static/page-hero"

export const metadata = {
  title: "Quem somos — Profissionaliza Mais Brasil",
  description: "Nossa missão é transformar vidas com educação profissionalizante acessível.",
}

export default function SobrePage() {
  return (
    <>
      <PageHero
        eyebrow="Quem somos"
        titulo="Educação que muda vidas, no Brasil inteiro"
        subtitulo="Somos uma plataforma de cursos profissionalizantes online com preço justo, certificado reconhecido e acesso contínuo. Acreditamos que aprender uma profissão é o caminho mais curto para mudar de vida."
      />
      <PageBody>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              icon: Target,
              titulo: "Nossa missão",
              texto: "Democratizar o acesso a cursos profissionalizantes de qualidade, com preço que cabe no bolso de quem mais precisa.",
            },
            {
              icon: Users,
              titulo: "Nosso público",
              texto: "Brasileiros que querem uma profissão, mudar de carreira, ter uma renda extra ou montar o próprio negócio.",
            },
            {
              icon: TrendingUp,
              titulo: "Nosso impacto",
              texto: "Mais de uma década de operação no setor de educação profissionalizante. Histórias reais de quem saiu do zero para o mercado.",
            },
          ].map((b) => (
            <div key={b.titulo} className="rounded-xl border border-[rgba(2,89,24,0.08)] bg-white p-6">
              <b.icon className="h-9 w-9 text-[var(--color-pmb-gold-600)]" strokeWidth={2} aria-hidden />
              <h2 className="mt-4 text-[17px] font-black text-[var(--color-pmb-green)]">{b.titulo}</h2>
              <p className="mt-2 text-[13.5px] leading-relaxed text-[rgba(2,89,24,0.75)]">{b.texto}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-xl border border-[rgba(2,89,24,0.08)] bg-white p-6 md:p-10">
          <h2 className="text-[22px] font-black text-[var(--color-pmb-green)]">Nossa história</h2>
          <p className="mt-3 text-[14.5px] leading-relaxed text-[rgba(2,89,24,0.8)]">
            A Profissionaliza Mais Brasil nasceu com um objetivo claro: tornar a educação
            profissionalizante acessível a quem quer aprender uma profissão e começar a faturar,
            sem pagar fortuna por cursos que demoram anos.
          </p>
          <p className="mt-3 text-[14.5px] leading-relaxed text-[rgba(2,89,24,0.8)]">
            Nos últimos anos, ajudamos milhares de brasileiros a iniciar novas carreiras — do
            salão de beleza no bairro à oficina de manutenção, da confeitaria em casa à assistência
            técnica. Cada aluno que se forma é uma história de transformação.
          </p>
          <p className="mt-3 text-[14.5px] leading-relaxed text-[rgba(2,89,24,0.8)]">
            Hoje, somos uma plataforma nacional com centenas de cursos profissionalizantes,
            uma rede de revendedores parceiros e um time dedicado a fazer da educação um caminho real
            de mobilidade social.
          </p>
        </div>

        <div className="mt-10 flex flex-col items-center gap-3 rounded-xl bg-[var(--color-pmb-green)] p-8 text-center text-white">
          <h2 className="text-[22px] font-black">Vem com a gente</h2>
          <p className="max-w-xl text-[14px] text-white/80">
            Se você quer aprender uma profissão ou revender nossos cursos, tem lugar aqui.
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            <Link
              href="/cursos"
              className="rounded-lg bg-[var(--color-pmb-gold)] px-5 py-3 text-[14px] font-black text-[var(--color-pmb-green)]"
            >
              Ver cursos
            </Link>
            <Link
              href="/seja-revendedor"
              className="rounded-lg border border-white/30 bg-white/10 px-5 py-3 text-[14px] font-black text-white hover:bg-white/15"
            >
              Seja revendedor
            </Link>
          </div>
        </div>
      </PageBody>
    </>
  )
}
