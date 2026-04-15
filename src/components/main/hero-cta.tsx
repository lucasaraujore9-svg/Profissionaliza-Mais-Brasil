import { ArrowRight, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"

const trustPoints = [
  "Sem taxa de adesão",
  "Cancele quando quiser",
  "Suporte em português",
]

export function HeroCTA() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-[var(--color-pmb-green)] via-[var(--color-pmb-green-700)] to-[var(--color-pmb-green-900)] py-20 md:py-28 lg:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.4) 0%, transparent 40%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.3) 0%, transparent 40%)",
        }}
      />

      <div className="relative mx-auto max-w-4xl px-4 text-center md:px-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-1.5 text-xs font-medium text-white backdrop-blur">
          Programa de parceria
        </div>

        <h1 className="mt-6 text-4xl font-bold tracking-tight text-white md:text-5xl lg:text-6xl">
          Construa seu negócio de cursos online com a{" "}
          <span className="text-yellow-300">nossa infraestrutura</span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-base text-[var(--color-pmb-lime-50)] md:text-lg">
          Vitrine própria, domínio personalizado, catálogo com 120+ cursos profissionalizantes
          e toda a operação de pagamento e matrícula automatizada.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <a href="#formulario">
            <Button size="lg" className="w-full bg-yellow-300 text-[var(--color-pmb-green-900)] hover:bg-yellow-400 sm:w-auto">
              Começar Agora
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </a>
          <a href="#planos">
            <Button
              size="lg"
              variant="outline"
              className="w-full border-white/40 bg-transparent text-white hover:bg-white/10 sm:w-auto"
            >
              Ver Planos
            </Button>
          </a>
        </div>

        <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-[var(--color-pmb-lime-50)]">
          {trustPoints.map((point) => (
            <li key={point} className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-yellow-300" />
              {point}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
