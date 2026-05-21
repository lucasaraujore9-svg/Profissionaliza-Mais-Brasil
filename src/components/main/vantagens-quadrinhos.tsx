import {
  Building2,
  Headset,
  Palette,
  BookOpenCheck,
  HandCoins,
  Award,
} from "lucide-react"

const vantagens = [
  {
    icon: Building2,
    rotulo: "Quem está com você",
    titulo: "Maior grupo educacional do país",
    descricao:
      "Somos o GRUPO BOLSA MAIS BRASIL. Já impactamos mais de 1,5 milhão de alunos e te ensinamos, na íntegra, como replicar o nosso modelo de negócio.",
  },
  {
    icon: Headset,
    rotulo: "Suporte de verdade",
    titulo: "Treinamento, equipe e automações",
    descricao:
      "Além do suporte e treinamento do nosso time, você conta com uma das nossas empresas de tecnologia e inteligência de mercado pra te ajudar a vender.",
  },
  {
    icon: Palette,
    rotulo: "Sua marca, seu portal",
    titulo: "Site totalmente personalizado",
    descricao:
      "Suas cores, sua logo, seu endereço eletrônico. O aluno enxerga só a sua marca, nada do nosso nome aparece em momento nenhum.",
  },
  {
    icon: BookOpenCheck,
    rotulo: "Catálogo pronto",
    titulo: "Mais de 100 cursos pra vender",
    descricao:
      "O catálogo já chega pronto, com aulas e certificado. E se quiser, você ainda pode criar e ofertar os seus próprios cursos dentro da plataforma.",
  },
  {
    icon: HandCoins,
    rotulo: "Seu lucro, seu controle",
    titulo: "Você define o preço de cada curso",
    descricao:
      "Não interferimos no que você cobra do aluno. Sem comissão por venda, sem taxa por matrícula. Você paga uma mensalidade e fica com tudo.",
  },
  {
    icon: Award,
    rotulo: "Bônus exclusivo",
    titulo: "Cursos técnicos com selo do MEC",
    descricao:
      "Sem custo adicional, você pode se tornar parceiro da Escola Técnica do Brasil e ofertar +70 cursos técnicos EAD credenciados pelo MEC.",
  },
]

export function VantagensQuadrinhos() {
  return (
    <section className="relative bg-white py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="max-w-3xl" data-reveal>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-pmb-green)]">
            Vantagens de ser nosso parceiro
          </p>
          <h2 className="mt-4 text-4xl font-black leading-[1.05] tracking-tight text-[var(--color-pmb-green-900)] md:text-5xl">
            Um modelo de negócio onde os seus{" "}
            <span className="relative inline-block px-1.5">
              <span className="relative z-10 italic">ganhos são ilimitados.</span>
              <span
                aria-hidden
                data-marker
                className="absolute inset-0 -z-0 rounded-sm bg-[var(--color-pmb-lime)]/70"
              />
            </span>
          </h2>
        </div>

        <div
          className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
          data-stagger
        >
          {vantagens.map((item, index) => {
            const isFirstRow = index < 3
            const isFirstCol = index % 3 === 0
            return (
              <article
                key={item.titulo}
                className={`group relative flex flex-col gap-4 p-6 transition-colors hover:bg-[var(--color-pmb-mist)] md:p-8 ${
                  isFirstRow ? "" : "border-t border-[var(--color-pmb-green-900)]/10"
                } ${isFirstCol ? "" : "md:border-l md:border-[var(--color-pmb-green-900)]/10"}`}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)] transition-transform group-hover:-rotate-3 group-hover:scale-105">
                  <item.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-pmb-green)]/70">
                    {item.rotulo}
                  </p>
                  <h3 className="mt-1.5 text-lg font-bold tracking-tight text-[var(--color-pmb-green-900)] md:text-xl">
                    {item.titulo}
                  </h3>
                </div>
                <p className="text-sm leading-relaxed text-gray-600 md:text-base">
                  {item.descricao}
                </p>
              </article>
            )
          })}
        </div>

        <div className="mt-14 flex items-center justify-center" data-reveal>
          <div className="inline-flex items-center gap-3 rounded-full bg-yellow-300/15 px-5 py-2.5 ring-1 ring-yellow-300/40">
            <p className="text-sm font-bold text-[var(--color-pmb-green-900)] md:text-base">
              E você nem precisa de CNPJ pra começar.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
