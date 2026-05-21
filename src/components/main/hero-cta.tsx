import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { prisma } from "@/lib/prisma"
import { CountUp } from "./anim/count-up"

const FALLBACK_CURSOS = 100

async function loadCursoCount(): Promise<number> {
  try {
    const real = await prisma.course.count({ where: { status: "ATIVO" } })
    return Math.max(real, FALLBACK_CURSOS)
  } catch (error) {
    console.error("[HeroCTA] fallback:", error)
    return FALLBACK_CURSOS
  }
}

export async function HeroCTA() {
  const cursos = await loadCursoCount()

  return (
    <section className="relative overflow-hidden bg-[var(--color-pmb-green-900)] pb-0 pt-20 md:pt-28 lg:pt-32">
      <div
        aria-hidden
        data-parallax="40"
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          backgroundImage:
            "radial-gradient(circle at 85% 0%, rgba(192,217,4,0.4) 0%, transparent 35%), radial-gradient(circle at 15% 100%, rgba(242,183,5,0.3) 0%, transparent 35%)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-4 md:px-8">
        <div className="grid grid-cols-1 gap-12 pb-20 lg:grid-cols-12 lg:gap-8 lg:pb-28">
          <div className="lg:col-span-7">
            <p
              data-reveal
              className="font-mono text-xs uppercase tracking-[0.2em] text-yellow-300/90"
            >
              Profissionaliza Mais Brasil
            </p>

            <h1
              data-reveal
              data-reveal-delay="0.1"
              className="mt-5 text-[clamp(2.4rem,6.5vw,5rem)] font-black leading-[0.95] tracking-tight text-white"
            >
              Tenha o seu{" "}
              <span className="relative inline-block">
                <span className="relative z-10 italic text-[var(--color-pmb-green-900)]">
                  portal de cursos
                </span>
                <span
                  aria-hidden
                  data-marker
                  className="absolute inset-x-0 bottom-1 -z-0 h-[0.85em] -skew-y-2 bg-yellow-300"
                />
              </span>
              <br />
              profissionalizantes.
            </h1>

            <p
              data-reveal
              data-reveal-delay="0.2"
              className="mt-7 max-w-xl text-base leading-relaxed text-white/85 md:text-lg"
            >
              Empreenda com um modelo inovador no mercado da educação e tenha
              acesso a mais de {cursos} cursos profissionalizantes prontos pra
              comercialização em todo o Brasil. Sem CNPJ, sem ter que gravar
              aula, sem comissão sobre as vendas.
            </p>

            <div
              data-reveal
              data-reveal-delay="0.3"
              className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center"
            >
              <a href="#formulario">
                <Button
                  size="lg"
                  className="h-13 w-full bg-yellow-300 px-8 text-base font-bold text-[var(--color-pmb-green-900)] transition-transform hover:scale-[1.02] hover:bg-yellow-400 sm:w-auto"
                >
                  Quero ser um parceiro
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </a>
              <a
                href="#plano"
                className="group inline-flex items-center justify-center gap-2 text-sm font-medium text-white/80 underline-offset-4 hover:text-yellow-300 hover:underline"
              >
                Ou veja quanto custa primeiro
              </a>
            </div>

            <ul
              data-reveal
              data-reveal-delay="0.4"
              className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-white/70"
            >
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-yellow-300" />
                Seu site personalizado
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-yellow-300" />
                Você define os preços
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-yellow-300" />
                Suporte do maior grupo educacional do país
              </li>
            </ul>
          </div>

          <aside className="lg:col-span-5 lg:pt-6" data-reveal data-reveal-delay="0.35">
            <div className="relative">
              <div
                aria-hidden
                className="absolute -left-2 -top-2 h-full w-full rounded-2xl bg-yellow-300/30"
              />
              <blockquote className="relative rounded-2xl bg-white/10 p-7 backdrop-blur-sm ring-1 ring-white/15">
                <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-yellow-300/90">
                  O que é o Profissionaliza Mais Brasil
                </p>
                <p className="mt-4 text-base leading-relaxed text-white md:text-lg">
                  Uma plataforma brasileira que entrega um portal de cursos
                  profissionalizantes completo, com{" "}
                  <strong className="font-bold">
                    mais de {cursos} cursos prontos
                  </strong>
                  , site com a sua marca e pagamento direto na sua conta, por{" "}
                  <strong className="font-bold">R$ 209 por mês</strong>.
                </p>
              </blockquote>
            </div>
          </aside>
        </div>

        <div className="relative -mx-4 grid grid-cols-3 divide-x divide-white/15 border-t border-white/15 md:-mx-8">
          <div className="px-4 py-6 md:px-8 md:py-8" data-reveal>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-yellow-300/80">
              Cursos no catálogo
            </p>
            <p className="mt-2 text-3xl font-black text-white md:text-5xl">
              <CountUp target={cursos} suffix="+" />
            </p>
          </div>
          <div className="px-4 py-6 md:px-8 md:py-8" data-reveal data-reveal-delay="0.1">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-yellow-300/80">
              Alunos impactados pelo grupo
            </p>
            <p className="mt-2 text-3xl font-black text-white md:text-5xl">
              <CountUp target={1_500_000} compact suffix="+" />
            </p>
          </div>
          <div className="px-4 py-6 md:px-8 md:py-8" data-reveal data-reveal-delay="0.2">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-yellow-300/80">
              Parceiros em todo o Brasil
            </p>
            <p className="mt-2 text-3xl font-black text-white md:text-5xl">
              <CountUp target={3} suffix=" MIL+" />
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
