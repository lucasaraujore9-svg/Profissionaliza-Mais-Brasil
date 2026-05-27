import { Quote } from "lucide-react"

interface Depoimento {
  nome: string
  cargo: string
  foto: string
  fotoColor: string
  texto: string
}

// Depoimentos reais de parceiros/consultores adaptados para a Profissionaliza
// Mais Brasil. Nomes foram anonimizados (primeiro nome + inicial do sobrenome)
// e o texto editado para nao citar marcas anteriores ou nomenclatura de
// "embaixador" — usamos "parceiro"/"consultor" alinhado ao programa atual.
// Sem fotos reais: avatares sao iniciais coloridas.

const featured: Depoimento = {
  nome: "Manoel M.",
  cargo: "Consultor parceiro",
  foto: "MM",
  fotoColor: "bg-[var(--color-pmb-gold)] text-[var(--color-pmb-green-900)]",
  texto:
    "Não tenho palavras para agradecer toda essa reviravolta na minha vida! Quem imaginaria que eu, que estava no meu antigo emprego como assistente administrativo e auxiliar de manutenção, me tornaria um consultor? Obrigado a todos por abrirem essa porta e me darem a liberdade de trabalhar de onde eu quiser e ainda ganhar o meu próprio dinheiro.",
}

const secundarios: Depoimento[] = [
  {
    nome: "Sol O.",
    cargo: "Unidade parceira",
    foto: "SO",
    fotoColor: "bg-emerald-700 text-white",
    texto:
      "Estou incrivelmente satisfeita com a parceria. Finalmente conseguimos trazer rentabilidade para todos os nossos polos, oferecendo cursos profissionalizantes. Destaco o suporte ao parceiro e o compromisso da equipe, que têm sido essenciais para o sucesso de cada unidade.",
  },
  {
    nome: "Neto F.",
    cargo: "Consultor educacional",
    foto: "NF",
    fotoColor: "bg-[var(--color-pmb-cyan)] text-white",
    texto:
      "A consultoria educacional me permitiu uma renda mensal que hoje é indispensável no meu orçamento. Estou trabalhando para que logo se torne minha principal fonte. Hoje ofereço uma solução educacional completa para meus alunos.",
  },
  {
    nome: "Ricardo M.",
    cargo: "Parceiro",
    foto: "RM",
    fotoColor: "bg-amber-600 text-white",
    texto:
      "Ser parceiro me proporciona liberdade para trabalhar de casa, mais tempo com a família e, o melhor de tudo, uma remuneração recorrente que me ajuda a realizar alguns sonhos.",
  },
  {
    nome: "Caio I.",
    cargo: "Parceiro educacional",
    foto: "CI",
    fotoColor: "bg-[var(--color-pmb-green)] text-white",
    texto:
      "Como profissional da área da saúde e dono de uma escola, a parceria me proporcionou uma expansão de produtos a oferecer, além da possibilidade de transformar vidas — porque a educação é transformadora. Os ideais batem com os que busco manter no meu dia a dia.",
  },
  {
    nome: "Rodrigo V.",
    cargo: "Parceiro",
    foto: "RV",
    fotoColor: "bg-rose-600 text-white",
    texto:
      "Inicialmente seria apenas uma renda extra, mas ao conhecer melhor o projeto e entender a profundidade que ele pode alcançar, decidi fazer disso o meu projeto principal. Agradeço muito pela oportunidade.",
  },
  {
    nome: "Mayron O.",
    cargo: "Consultor parceiro",
    foto: "MO",
    fotoColor: "bg-[var(--color-pmb-green-900)] text-white",
    texto:
      "Hoje tenho o privilégio de fazer parte desse projeto que abriu horizontes para mim. Reconheci o mar azul que estava diante de mim e, como consultor, tenho uma fonte de renda extra na minha instituição. Tem mudado minha vida financeira e profissional.",
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
            Parceiros que vão dividir a história com você.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-gray-600 md:text-lg">
            Histórias reais de parceiros e consultores que transformaram a
            educação em renda — e em propósito.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-8 lg:grid-cols-5">
          <figure
            className="relative overflow-hidden rounded-3xl bg-[var(--color-pmb-green-900)] p-8 lg:col-span-3 lg:p-12"
            data-reveal
            data-reveal-delay="0.1"
          >
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
                className={`flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold ${featured.fotoColor}`}
                aria-hidden
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
            {secundarios.slice(0, 3).map((d) => (
              <figure
                key={d.nome}
                className="rounded-2xl border border-[var(--color-pmb-green-900)]/10 bg-[var(--color-pmb-mist)] p-6"
              >
                <blockquote className="text-sm leading-relaxed text-gray-800 md:text-base">
                  &ldquo;{d.texto}&rdquo;
                </blockquote>
                <figcaption className="mt-5 flex items-center gap-3 border-t border-[var(--color-pmb-green-900)]/10 pt-4">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold ${d.fotoColor}`}
                    aria-hidden
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

        {/* Linha extra com os 3 depoimentos restantes */}
        {secundarios.length > 3 && (
          <div
            className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3"
            data-stagger
          >
            {secundarios.slice(3).map((d) => (
              <figure
                key={d.nome}
                className="rounded-2xl border border-[var(--color-pmb-green-900)]/10 bg-[var(--color-pmb-mist)] p-6"
              >
                <Quote
                  aria-hidden
                  className="h-6 w-6 text-[var(--color-pmb-green)] opacity-70"
                  strokeWidth={2}
                />
                <blockquote className="mt-3 text-sm leading-relaxed text-gray-800 md:text-base">
                  &ldquo;{d.texto}&rdquo;
                </blockquote>
                <figcaption className="mt-5 flex items-center gap-3 border-t border-[var(--color-pmb-green-900)]/10 pt-4">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold ${d.fotoColor}`}
                    aria-hidden
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
        )}
      </div>
    </section>
  )
}
