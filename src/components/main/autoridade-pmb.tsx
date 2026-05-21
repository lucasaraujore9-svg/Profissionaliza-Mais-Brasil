import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"

const pilares = [
  {
    rotulo: "Empresa",
    titulo: "GRUPO BOLSA MAIS BRASIL",
    descricao:
      "CNPJ 66.553.170/0001-01. 10 anos de história em educação, com a missão de transformar vidas e ajudar quem quer empreender.",
  },
  {
    rotulo: "Conteúdo",
    titulo: "Escola Avançada",
    descricao:
      "Uma das maiores empresas de cursos livres do país, com mais de 10 anos de mercado. Você revende algo que já funciona.",
  },
  {
    rotulo: "Tecnologia",
    titulo: "Plataforma própria",
    descricao:
      "Construímos do zero. Cada escola tem o seu próprio espaço, isolado das outras. Rodamos 24 horas por dia.",
  },
]

export function AutoridadePMB() {
  return (
    <section className="bg-[var(--color-pmb-green-900)] py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="grid grid-cols-1 gap-14 lg:grid-cols-12 lg:gap-16">
          <header className="lg:col-span-5" data-reveal>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-yellow-300">
              Quem está por trás
            </p>
            <h2 className="mt-5 text-4xl font-black leading-tight tracking-tight text-white md:text-5xl">
              10 anos ajudando gente a se profissionalizar.
            </h2>
            <p className="mt-6 text-base leading-relaxed text-white/80 md:text-lg">
              O Profissionaliza Mais Brasil nasceu pra que qualquer pessoa, sem
              capital pra abrir uma escola física, possa ter a sua própria
              escola de cursos online.
            </p>
            <p className="mt-4 text-base leading-relaxed text-white/80 md:text-lg">
              A divisão de tarefas é simples: você divulga e atende o aluno. A
              gente cuida da tecnologia, dos cursos e da entrega.
            </p>

            <a href="#formulario" className="mt-8 inline-block">
              <Button
                size="lg"
                className="bg-yellow-300 font-bold text-[var(--color-pmb-green-900)] hover:bg-yellow-400"
              >
                Quero começar a minha escola
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </a>
          </header>

          <dl className="space-y-px lg:col-span-7" data-stagger data-stagger-step="0.1">
            {pilares.map((p) => (
              <div
                key={p.titulo}
                className="grid grid-cols-12 gap-4 border-t border-white/10 py-7 last:border-b"
              >
                <dt className="col-span-12 md:col-span-3">
                  <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-yellow-300/90">
                    {p.rotulo}
                  </span>
                </dt>
                <dd className="col-span-12 md:col-span-9">
                  <p className="text-2xl font-bold leading-tight text-white md:text-3xl">
                    {p.titulo}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-white/70 md:text-base">
                    {p.descricao}
                  </p>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  )
}
