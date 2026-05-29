import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { prisma } from "@/lib/prisma"
import { HeroMockup } from "./hero-mockup"
import { contextLogger } from "@/lib/logger"

async function loadCursoCount(): Promise<number | null> {
  try {
    const real = await prisma.course.count({ where: { status: "ATIVO" } })
    return real > 0 ? real : null
  } catch (error) {
    contextLogger().error(
      { err: error, event: "hero_cta.curso_count_failed" },
      "HeroCTA curso count falhou",
    )
    return null
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
              Para quem vai empreender em educação
            </p>

            <h1
              data-reveal
              data-reveal-delay="0.1"
              className="mt-4 text-[clamp(1.85rem,5.6vw,3.25rem)] font-black leading-[0.95] tracking-tight text-white sm:mt-5 lg:text-[clamp(2.5rem,3.8vw,3.75rem)]"
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
              Educação muda vida — e dá pra viver dela. Tenha um catálogo
              {cursos ? <> de <strong className="font-bold text-white">mais de {cursos} cursos</strong></> : <> <strong className="font-bold text-white">completo de cursos</strong></>}{" "}
              profissionalizantes pra vender com a sua marca, no Brasil inteiro.
              Você define cada preço, recebe direto na sua conta e a matrícula é
              automática. <strong className="font-bold text-white">A partir de R$ 209/mês</strong>{" "}
              — sem CNPJ, sem gravar aula, sem comissão sobre as suas vendas.
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
                  Quero o meu portal
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </a>
              <a
                href="#planos"
                className="text-center text-sm font-medium text-white/80 underline-offset-4 hover:text-yellow-300 hover:underline sm:text-left"
              >
                Antes, quero ver os planos
              </a>
            </div>

            <ul
              data-reveal
              data-reveal-delay="0.4"
              className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-white/70 sm:gap-x-6"
            >
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-yellow-300" />
                Site no ar em poucas horas
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-yellow-300" />
                Cada preço é decisão sua
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-yellow-300" />
                Suporte do Grupo Bolsa Mais Brasil
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

        {/* Proof strip — full bleed na borda inferior da seção */}
        <div className="relative -mx-4 grid grid-cols-1 divide-y divide-white/15 border-t border-white/15 sm:grid-cols-3 sm:divide-x sm:divide-y-0 md:-mx-8">
          <div className="px-4 py-5 text-left sm:px-6 sm:py-7 sm:text-center md:px-8 md:py-8" data-reveal>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-yellow-300/80">
              Catálogo pronto
            </p>
            <p className="mt-1.5 text-base font-bold text-white sm:mt-2 md:text-lg">
              Cursos profissionalizantes com certificado nacional, prontos pra vender
            </p>
          </div>
          <div
            className="px-4 py-5 text-left sm:px-6 sm:py-7 sm:text-center md:px-8 md:py-8"
            data-reveal
            data-reveal-delay="0.1"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-yellow-300/80">
              10+ anos de estrada
            </p>
            <p className="mt-1.5 text-base font-bold text-white sm:mt-2 md:text-lg">
              Grupo Bolsa Mais Brasil — referência em educação profissionalizante
            </p>
          </div>
          <div
            className="px-4 py-5 text-left sm:px-6 sm:py-7 sm:text-center md:px-8 md:py-8"
            data-reveal
            data-reveal-delay="0.2"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-yellow-300/80">
              Tudo automático
            </p>
            <p className="mt-1.5 text-base font-bold text-white sm:mt-2 md:text-lg">
              Vitrine, matrícula, pagamento e certificado — você foca em vender
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
