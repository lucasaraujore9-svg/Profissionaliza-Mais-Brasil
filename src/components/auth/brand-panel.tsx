import { Sparkles, ShieldCheck, TrendingUp } from "lucide-react"

const highlights = [
  {
    icon: TrendingUp,
    title: "Comissões até 40%",
    description: "Ganhe mais a cada aluno matriculado na sua vitrine.",
  },
  {
    icon: ShieldCheck,
    title: "Pagamentos seguros",
    description: "Integração direta com Mercado Pago. Receba no seu CNPJ.",
  },
  {
    icon: Sparkles,
    title: "Vitrine personalizada",
    description: "Domínio próprio, cores da sua marca, catálogo curado.",
  },
] as const

export function BrandPanel() {
  return (
    <div className="relative hidden overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 lg:flex lg:w-1/2">
      <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_30%_20%,#60a5fa,transparent_40%),radial-gradient(circle_at_80%_80%,#6366f1,transparent_45%)]" />

      <div className="relative z-10 flex w-full flex-col justify-between px-12 py-14 text-white">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
            Plataforma ativa
          </div>
          <h1 className="mt-6 text-3xl font-bold leading-tight xl:text-4xl">
            Profissionaliza
            <br />
            Mais Brasil
          </h1>
          <p className="mt-3 max-w-md text-base text-blue-100">
            Venda cursos profissionalizantes com sua marca e construa sua
            escola digital em dias.
          </p>
        </div>

        <ul className="mt-12 space-y-5">
          {highlights.map((item) => {
            const Icon = item.icon
            return (
              <li key={item.title} className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 backdrop-blur">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold">{item.title}</div>
                  <p className="mt-0.5 text-sm text-blue-100/90">
                    {item.description}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>

        <div className="mt-12 flex items-center gap-3 text-xs text-blue-100">
          <div className="flex -space-x-2">
            {["bg-yellow-400", "bg-pink-400", "bg-emerald-400"].map(
              (color, i) => (
                <div
                  key={i}
                  className={`h-7 w-7 rounded-full border-2 border-blue-700 ${color}`}
                />
              ),
            )}
          </div>
          <span>
            <strong className="text-white">+500 revendedores</strong> já
            vendem com a gente.
          </span>
        </div>
      </div>
    </div>
  )
}
