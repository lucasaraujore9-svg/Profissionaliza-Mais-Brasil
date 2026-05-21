import { ArrowRight, Quote } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CountUp } from "./anim/count-up"

interface Numero {
  valor: number
  compact?: boolean
  suffix: string
  rotulo: string
}

const numeros: Numero[] = [
  {
    valor: 1_500_000,
    compact: true,
    suffix: "+",
    rotulo: "vidas transformadas",
  },
  {
    valor: 3,
    suffix: " MIL+",
    rotulo: "parceiros no Brasil",
  },
  {
    valor: 100,
    suffix: "+",
    rotulo: "cursos profissionalizantes",
  },
]

export function ManifestoFundador() {
  return (
    <section className="relative overflow-hidden bg-[var(--color-pmb-mist)] py-20 md:py-28">
      <div
        aria-hidden
        data-parallax="60"
        className="pointer-events-none absolute -right-40 top-0 h-[500px] w-[500px] rounded-full bg-[var(--color-pmb-lime)]/15 blur-3xl"
      />

      <div className="relative mx-auto max-w-5xl px-4 md:px-8">
        <header data-reveal className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-pmb-green)]">
            A história por trás disso
          </p>
          <h2 className="mt-4 text-4xl font-black leading-[1.05] tracking-tight text-[var(--color-pmb-green-900)] md:text-5xl">
            Nascemos na sala de casa.
            <br />
            Hoje somos um dos
            <span className="italic text-[var(--color-pmb-green)]">
              {" "}maiores grupos educacionais
            </span>{" "}
            do país.
          </h2>
        </header>

        <div className="mt-14 grid grid-cols-1 gap-y-3 lg:grid-cols-3 lg:gap-x-10" data-stagger>
          {numeros.map((n) => (
            <div
              key={n.rotulo}
              className="border-t border-[var(--color-pmb-green-900)]/10 pt-4"
            >
              <p className="text-5xl font-black tracking-tight text-[var(--color-pmb-green-900)] md:text-6xl">
                <CountUp target={n.valor} compact={n.compact} suffix={n.suffix} />
              </p>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.2em] text-gray-500">
                {n.rotulo}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-16 grid grid-cols-1 gap-12 lg:grid-cols-12">
          <div className="space-y-5 lg:col-span-7" data-reveal>
            <p className="text-base leading-relaxed text-gray-800 md:text-lg">
              A nossa missão é transformar vidas através da educação. Ajudar
              empreendedores, sendo eles da área ou não, a prosperarem,
              enriquecerem e impactarem outras pessoas, do jeito que aconteceu
              com a gente desde o começo.
            </p>
            <p className="text-base leading-relaxed text-gray-800 md:text-lg">
              Você vai ter um portal próprio, totalmente personalizado com as
              suas cores, sua logomarca e seu endereço eletrônico, com mais de
              100 cursos profissionalizantes pra comercializar. E o melhor:{" "}
              <strong className="text-[var(--color-pmb-green-900)]">
                você mesmo define o preço de cada curso
              </strong>
              , pagando uma mensalidade pequena pela plataforma.{" "}
              <em>Não queremos saber quanto você está ganhando.</em>
            </p>
            <p className="text-base leading-relaxed text-gray-800 md:text-lg">
              A gente entrega tudo pronto: dashboard pra acompanhar as
              matrículas, integração com PIX, boleto e cartão de crédito (com
              parcelamento e recebimento antecipado). Você ainda pode criar e
              ofertar os seus próprios cursos dentro da plataforma.
            </p>
            <p className="text-base leading-relaxed text-gray-800 md:text-lg">
              E tem mais: você pode se tornar parceiro da{" "}
              <strong className="text-[var(--color-pmb-green-900)]">
                Escola Técnica do Brasil
              </strong>{" "}
              e ofertar +70 cursos técnicos credenciados pelo MEC. Sem custo
              adicional.
            </p>
          </div>

          <aside className="lg:col-span-5" data-reveal data-reveal-delay="0.15">
            <figure className="sticky top-24 rounded-3xl bg-[var(--color-pmb-green-900)] p-8 md:p-10">
              <Quote
                aria-hidden
                className="h-10 w-10 text-yellow-300"
                strokeWidth={1.5}
              />
              <blockquote className="mt-4 text-lg font-medium leading-snug text-white md:text-xl">
                &ldquo;Mesmo sem experiência na área, eu garanto, como
                idealizador do Grupo Bolsa Mais Brasil, que é praticamente
                impossível não vender esses cursos e ter uma excelente margem
                de lucro.&rdquo;
              </blockquote>
              <figcaption className="mt-6 border-t border-white/15 pt-5">
                <p className="font-bold text-white">O idealizador do GBMB</p>
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-yellow-300/90">
                  Grupo Bolsa Mais Brasil
                </p>
              </figcaption>
            </figure>
          </aside>
        </div>

        <div className="mt-16 flex flex-wrap items-center gap-5" data-reveal>
          <a href="#formulario">
            <Button
              size="lg"
              className="h-13 bg-[var(--color-pmb-green)] px-8 text-base font-bold text-white hover:bg-[var(--color-pmb-green-700)]"
            >
              Quero ter o meu portal personalizado
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </a>
          <p className="text-sm text-gray-600">
            Estaremos ao seu lado em cada etapa dessa jornada.
          </p>
        </div>
      </div>
    </section>
  )
}
