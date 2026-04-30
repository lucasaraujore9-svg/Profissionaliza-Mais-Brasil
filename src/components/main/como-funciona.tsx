import { UserPlus, Store, TrendingUp } from "lucide-react"

const steps = [
  {
    icon: UserPlus,
    number: "01",
    title: "Cadastra",
    description: "Crie sua conta, escolha seu plano e configure sua vitrine em minutos.",
  },
  {
    icon: Store,
    number: "02",
    title: "Vende",
    description: "Divulgue os cursos do catálogo e receba pagamentos direto na sua conta.",
  },
  {
    icon: TrendingUp,
    number: "03",
    title: "Ganha",
    description: "Lucre com cada matrícula. Alunos são auto-inscritos na plataforma de aulas.",
  },
]

export function ComoFunciona() {
  return (
    <section id="como-funciona" className="bg-white py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[var(--color-pmb-green-900)] md:text-4xl">
            Como funciona
          </h2>
          <p className="mt-4 text-gray-600">
            Três passos simples pra começar a vender cursos profissionalizantes.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-6 lg:gap-8">
          {steps.map((step) => (
            <div
              key={step.number}
              className="relative rounded-2xl border border-gray-200 bg-white p-6 transition-shadow hover:shadow-md lg:p-8"
            >
              <div className="absolute -top-3 right-6 rounded-full bg-[var(--color-pmb-green)] px-3 py-1 font-mono text-xs font-semibold text-white">
                {step.number}
              </div>
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]">
                <step.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-xl font-semibold text-[var(--color-pmb-green-900)]">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
