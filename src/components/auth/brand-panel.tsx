import Image from "next/image"
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
    <div className="relative hidden overflow-hidden bg-[var(--color-pmb-green)] lg:flex lg:w-1/2">
      <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_20%_15%,rgba(242,183,5,0.32),transparent_45%),radial-gradient(circle_at_85%_85%,rgba(192,217,4,0.24),transparent_50%)]" />

      <div className="relative z-10 flex w-full flex-col justify-between px-12 py-14 text-white">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-pmb-lime)]" />
            Plataforma ativa
          </div>

          <div className="mt-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 backdrop-blur">
            <Image
              src="/images/logo.png"
              alt="Profissionaliza Mais Brasil"
              width={64}
              height={64}
              className="h-11 w-auto"
            />
          </div>

          <h1 className="mt-6 font-display text-3xl leading-tight xl:text-4xl">
            Profissionaliza
            <br />
            Mais Brasil
          </h1>
          <p className="mt-3 max-w-md text-base text-white/85">
            Venda cursos profissionalizantes com sua marca e construa sua
            escola digital em dias.
          </p>
        </div>

        <ul className="mt-12 space-y-5">
          {highlights.map((item) => {
            const Icon = item.icon
            return (
              <li key={item.title} className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-pmb-gold)]/95 text-[var(--color-pmb-green-900)]">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">{item.title}</div>
                  <p className="mt-0.5 text-sm text-white/80">
                    {item.description}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>

        <div className="mt-12 flex items-center gap-3 text-xs text-white/80">
          <div className="flex -space-x-2">
            {[
              "bg-[var(--color-pmb-gold)]",
              "bg-[var(--color-pmb-lime)]",
              "bg-[var(--color-pmb-cyan)]",
            ].map((color, i) => (
              <div
                key={i}
                className={`h-7 w-7 rounded-full border-2 border-[var(--color-pmb-green)] ${color}`}
              />
            ))}
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
