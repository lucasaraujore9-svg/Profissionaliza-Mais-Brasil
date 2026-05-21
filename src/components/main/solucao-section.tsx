import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"

export function SolucaoSection() {
  return (
    <section className="relative overflow-hidden bg-[var(--color-pmb-green)] py-24 md:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-1/2 h-[500px] w-[500px] -translate-y-1/2 rounded-full bg-[var(--color-pmb-lime)]/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 top-0 h-[400px] w-[400px] rounded-full bg-yellow-300/10 blur-3xl"
      />

      <div className="relative mx-auto max-w-4xl px-4 md:px-8">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-yellow-300">
          Existe um jeito mais simples
        </p>

        <h2 className="mt-6 text-4xl font-black leading-[1.05] tracking-tight text-white md:text-6xl">
          A gente já fez a parte chata. Você
          <span className="ml-3 italic text-yellow-300">só divulga.</span>
        </h2>

        <div className="mt-12 grid grid-cols-1 gap-10 text-white/90 md:grid-cols-3">
          <p className="text-base leading-relaxed md:text-lg">
            O site pra você vender já fica pronto, com a sua marca e endereço
            próprio. Nada nosso aparece pro aluno.
          </p>
          <p className="text-base leading-relaxed md:text-lg">
            Os cursos com certificado já estão liberados. Sistema cobra o
            aluno, libera as aulas e manda o login sozinho.
          </p>
          <p className="text-base leading-relaxed md:text-lg">
            O dinheiro do aluno cai direto na sua conta. Você paga uma
            mensalidade fixa e fica com 100% do que vender.
          </p>
        </div>

        <div className="mt-12 flex flex-wrap items-center gap-6">
          <a href="#formulario">
            <Button
              size="lg"
              className="h-13 bg-yellow-300 px-8 text-base font-bold text-[var(--color-pmb-green-900)] hover:bg-yellow-400"
            >
              Quero ver isso funcionando
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </a>
          <p className="text-sm text-white/70">
            Em poucos dias, a sua escola está vendendo.
          </p>
        </div>
      </div>
    </section>
  )
}
