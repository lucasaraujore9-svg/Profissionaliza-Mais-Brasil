import { Globe, ShoppingBag, Zap, BarChart3, Shield } from "lucide-react"

const beneficios = [
  {
    icon: Globe,
    title: "Domínio personalizado",
    description:
      "Tenha sua própria URL (minhaescola.com.br) ou use um subdomínio nosso gratuitamente.",
    gradient: "from-[var(--color-pmb-mist)]0 to-cyan-500",
  },
  {
    icon: ShoppingBag,
    title: "Catálogo pronto",
    description:
      "Mais de 120 cursos profissionalizantes em 12 categorias. Você escolhe quais vender.",
    gradient: "from-purple-500 to-pink-500",
  },
  {
    icon: Zap,
    title: "Matrícula automática",
    description:
      "Aluno paga, recebe credenciais da Escola Avançada em segundos. Zero trabalho manual.",
    gradient: "from-yellow-500 to-orange-500",
  },
  {
    icon: BarChart3,
    title: "Dashboard completo",
    description:
      "Acompanhe vendas, matrículas, cupons e receita em tempo real. Relatórios exportáveis.",
    gradient: "from-green-500 to-emerald-500",
  },
  {
    icon: Shield,
    title: "Sem risco",
    description:
      "Cobrança mensal transparente, sem fidelidade. Cancele a qualquer momento sem multa.",
    gradient: "from-red-500 to-rose-500",
  },
]

export function BeneficiosZigZag() {
  return (
    <section className="bg-white py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[var(--color-pmb-green-900)] md:text-4xl">
            Tudo pronto pra você vender
          </h2>
          <p className="mt-4 text-gray-600">
            Você foca em marketing. A gente cuida da operação.
          </p>
        </div>

        <div className="mt-16 space-y-16 md:space-y-24">
          {beneficios.map((b, index) => (
            <div
              key={b.title}
              className={`grid grid-cols-1 items-center gap-8 md:grid-cols-2 md:gap-12 ${
                index % 2 === 1 ? "md:[&>*:first-child]:order-2" : ""
              }`}
            >
              <div
                className={`relative aspect-[4/3] overflow-hidden rounded-2xl bg-gradient-to-br ${b.gradient} shadow-xl`}
              >
                <div className="absolute inset-0 flex items-center justify-center">
                  <b.icon className="h-24 w-24 text-white/90" strokeWidth={1.5} />
                </div>
              </div>

              <div>
                <div className="font-mono text-xs font-semibold uppercase tracking-wider text-[var(--color-pmb-green)]">
                  Benefício 0{index + 1}
                </div>
                <h3 className="mt-3 text-2xl font-bold text-[var(--color-pmb-green-900)] md:text-3xl">
                  {b.title}
                </h3>
                <p className="mt-4 text-base leading-relaxed text-gray-600">
                  {b.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
