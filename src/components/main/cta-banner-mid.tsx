import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"

export function CTABannerMid() {
  return (
    <section className="relative overflow-hidden bg-yellow-300 py-16 md:py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, transparent 0, transparent 80px, rgba(0,0,0,0.04) 80px, rgba(0,0,0,0.04) 81px)",
        }}
      />

      <div className="relative mx-auto max-w-5xl px-4 md:px-8">
        <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-8" data-reveal>
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-[var(--color-pmb-green-900)]/80">
              Pra fechar
            </p>
            <h2 className="mt-4 text-3xl font-black leading-[1.05] tracking-tight text-[var(--color-pmb-green-900)] md:text-5xl">
              Hoje alguém abriu uma escola.
              <span className="italic"> Podia ser a sua.</span>
            </h2>
            <p className="mt-5 max-w-xl text-base text-[var(--color-pmb-green-900)]/80 md:text-lg">
              O modelo está pronto. A única diferença entre vender daqui um mês ou seguir parado é o tempo que você leva pra clicar no botão.
            </p>
          </div>

          <div className="lg:col-span-4 lg:text-right" data-reveal data-reveal-delay="0.15">
            <a href="#formulario">
              <Button
                size="lg"
                className="h-14 w-full bg-[var(--color-pmb-green-900)] px-8 text-base font-bold text-yellow-300 transition-transform hover:-translate-y-0.5 hover:bg-[var(--color-pmb-green)] lg:w-auto"
              >
                Quero abrir a minha
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
