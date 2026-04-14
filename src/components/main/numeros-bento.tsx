import { Users, GraduationCap, BookOpen, DollarSign } from "lucide-react"

const metrics = [
  {
    icon: Users,
    label: "Revendedores",
    value: "500+",
    hint: "Empreendedores ativos",
    color: "bg-blue-50 text-blue-600",
    span: "md:col-span-2",
  },
  {
    icon: BookOpen,
    label: "Cursos disponíveis",
    value: "120",
    hint: "Em 12 categorias",
    color: "bg-purple-50 text-purple-600",
    span: "",
  },
  {
    icon: GraduationCap,
    label: "Alunos ativos",
    value: "15.000+",
    hint: "Estudando agora",
    color: "bg-green-50 text-green-600",
    span: "",
  },
  {
    icon: DollarSign,
    label: "Receita gerada",
    value: "R$ 2.8M",
    hint: "Pelos revendedores em 2026",
    color: "bg-orange-50 text-orange-600",
    span: "md:col-span-2",
  },
]

export function NumerosBento() {
  return (
    <section className="bg-[#FAFAFA] py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[#1A1A2E] md:text-4xl">
            Números que inspiram
          </h2>
          <p className="mt-4 text-gray-600">
            A plataforma cresce junto com quem empreende.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className={`rounded-2xl border border-gray-200 bg-white p-6 lg:p-8 ${metric.span}`}
            >
              <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${metric.color}`}>
                <metric.icon className="h-5 w-5" />
              </div>
              <div className="mt-6 font-mono text-4xl font-bold tracking-tight text-[#1A1A2E] lg:text-5xl">
                {metric.value}
              </div>
              <p className="mt-2 text-sm font-medium text-[#1A1A2E]">{metric.label}</p>
              <p className="text-xs text-gray-500">{metric.hint}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
