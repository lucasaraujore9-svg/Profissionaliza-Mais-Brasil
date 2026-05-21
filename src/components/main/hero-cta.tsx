import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { prisma } from "@/lib/prisma"
import { CountUp } from "./anim/count-up"
import { HeroMockup } from "./hero-mockup"

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
    <section className="relative overflow-hidden bg-[var(--color-pmb-green-900)] pb-0 pt-16 sm:pt-20 md:pt-24 lg:pt-28">
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
        <div className="grid grid-cols-1 gap-10 pb-16 sm:gap-12 sm:pb-20 lg:grid-cols-12 lg:items-center lg:gap-10 lg:pb-24">
          {/* Coluna do copy */}
          <div className="lg:col-span-7">
            <p
              data-reveal
              className="font-mono text-[10px] uppercase tracking-[0.2em] text-yellow-300/90 sm:text-xs"
            >
              Profissionaliza Mais Brasil
            </p>

            <h1
              data-reveal
              data-reveal-delay="0.1"
              className="mt-4 text-[clamp(1.85rem,6.5vw,4.5rem)] font-black leading-[0.95] tracking-tight text-white sm:mt-5 lg:text-[clamp(2.75rem,5vw,5.5rem)]"
            >
              <span className="block sm:inline">Tenha o seu</span>{" "}
              <span className="relative inline-block px-2">
                <span className="relative z-10 italic text-[var(--color-pmb-green-900)]">
                  portal de cursos
                </span>
                <span
                  aria-hidden
                  data-marker
                  className="absolute inset-0 -z-0 rounded-sm bg-yellow-300"
                />
              </span>
              <br />
              profissionalizantes.
            </h1>

            <p
              data-reveal
              data-reveal-delay="0.2"
              className="mt-5 max-w-xl text-sm leading-relaxed text-white/85 sm:mt-6 sm:text-base md:text-lg"
            >
              Empreenda na educação com acesso a mais de {cursos} cursos
              prontos pra comercializar em todo o Brasil. Site com a sua marca,
              pagamento direto na sua conta, mensalidade fixa de{" "}
              <strong className="font-bold text-white">R$ 209</strong>. Sem
              CNPJ, sem gravar aula, sem comissão sobre vendas.
            </p>

            <div
              data-reveal
              data-reveal-delay="0.3"
              className="mt-7 flex flex-col gap-3 sm:mt-9 sm:flex-row sm:items-center"
            >
              <a href="#formulario">
                <Button
                  size="lg"
                  className="h-12 w-full bg-yellow-300 px-6 text-sm font-bold text-[var(--color-pmb-green-900)] transition-transform hover:scale-[1.02] hover:bg-yellow-400 sm:h-13 sm:w-auto sm:px-8 sm:text-base"
                >
                  Quero ser um parceiro
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </a>
              <a
                href="#plano"
                className="text-center text-sm font-medium text-white/80 underline-offset-4 hover:text-yellow-300 hover:underline sm:text-left"
              >
                Ou veja quanto custa primeiro
              </a>
            </div>

            <ul
              data-reveal
              data-reveal-delay="0.4"
              className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-white/70 sm:gap-x-6"
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

          {/* Coluna do mockup */}
          <aside
            data-reveal
            data-reveal-delay="0.35"
            className="lg:col-span-5"
          >
            <HeroMockup />
          </aside>
        </div>

        {/* Stats strip — full bleed na borda inferior da seção */}
        <div className="relative -mx-4 grid grid-cols-1 divide-y divide-white/15 border-t border-white/15 sm:grid-cols-3 sm:divide-x sm:divide-y-0 md:-mx-8">
          <div className="px-4 py-5 text-left sm:px-6 sm:py-7 sm:text-center md:px-8 md:py-8" data-reveal>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-yellow-300/80">
              Cursos no catálogo
            </p>
            <p className="mt-1.5 text-3xl font-black text-white sm:mt-2 md:text-5xl">
              <CountUp target={cursos} suffix="+" />
            </p>
          </div>
          <div
            className="px-4 py-5 text-left sm:px-6 sm:py-7 sm:text-center md:px-8 md:py-8"
            data-reveal
            data-reveal-delay="0.1"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-yellow-300/80">
              Alunos impactados pelo grupo
            </p>
            <p className="mt-1.5 text-3xl font-black text-white sm:mt-2 md:text-5xl">
              <CountUp target={1_500_000} compact suffix="+" />
            </p>
          </div>
          <div
            className="px-4 py-5 text-left sm:px-6 sm:py-7 sm:text-center md:px-8 md:py-8"
            data-reveal
            data-reveal-delay="0.2"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-yellow-300/80">
              Parceiros em todo o Brasil
            </p>
            <p className="mt-1.5 text-3xl font-black text-white sm:mt-2 md:text-5xl">
              <CountUp target={3} suffix=" MIL+" />
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
