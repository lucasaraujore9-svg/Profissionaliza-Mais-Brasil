import { Quote } from "lucide-react"

const featured = {
  nome: "Patrícia Mendes",
  cargo: "Parceira ativa desde 2024",
  foto: "PM",
  fotoColor: "bg-purple-500",
  texto:
    "Eu não entendia nada de site nem de cursos online. Em três meses já estava vendendo com a minha marca. A parte técnica é deles, eu só posto no Instagram e respondo aluno.",
}

const secundarios = [
  {
    nome: "Roberto Silva",
    cargo: "Já tinha escola física",
    foto: "RS",
    fotoColor: "bg-[var(--color-pmb-cyan)]",
    texto:
      "Em seis meses triplicamos o faturamento e nem precisei contratar gente nova.",
  },
  {
    nome: "Carla Nogueira",
    cargo: "Trabalha de casa",
    foto: "CN",
    fotoColor: "bg-green-500",
    texto:
      "Procurei algo pra trabalhar de casa sem precisar gravar curso. Hoje a renda da minha escola já passa do meu salário antigo.",
  },
]

export function DepoimentosSection() {
  return (
    <section className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="max-w-3xl" data-reveal>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-pmb-green)]">
            Quem já está vendendo
          </p>
          <h2 className="mt-4 text-4xl font-black leading-tight tracking-tight text-[var(--color-pmb-green-900)] md:text-5xl">
            Parceiros faturando de verdade.
          </h2>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-8 lg:grid-cols-5">
          <figure className="relative overflow-hidden rounded-3xl bg-[var(--color-pmb-green-900)] p-8 lg:col-span-3 lg:p-12" data-reveal data-reveal-delay="0.1">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-yellow-300/10 blur-2xl"
            />
            <Quote
              aria-hidden
              className="h-12 w-12 text-yellow-300"
              strokeWidth={1.5}
            />
            <blockquote className="relative mt-6 text-xl font-medium leading-snug text-white md:text-2xl lg:text-3xl">
              &ldquo;{featured.texto}&rdquo;
            </blockquote>
            <figcaption className="relative mt-10 flex items-center gap-4 border-t border-white/15 pt-6">
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white ${featured.fotoColor}`}
              >
                {featured.foto}
              </div>
              <div>
                <p className="font-bold text-white">{featured.nome}</p>
                <p className="font-mono text-xs uppercase tracking-wider text-yellow-300/90">
                  {featured.cargo}
                </p>
              </div>
            </figcaption>
          </figure>

          <div className="space-y-6 lg:col-span-2" data-stagger>
            {secundarios.map((d) => (
              <figure
                key={d.nome}
                className="rounded-2xl border border-[var(--color-pmb-green-900)]/10 bg-[var(--color-pmb-mist)] p-6"
              >
                <blockquote className="text-sm leading-relaxed text-gray-800 md:text-base">
                  &ldquo;{d.texto}&rdquo;
                </blockquote>
                <figcaption className="mt-5 flex items-center gap-3 border-t border-[var(--color-pmb-green-900)]/10 pt-4">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white ${d.fotoColor}`}
                  >
                    {d.foto}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[var(--color-pmb-green-900)]">
                      {d.nome}
                    </p>
                    <p className="text-xs text-gray-500">{d.cargo}</p>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
