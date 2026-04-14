import Link from "next/link"
import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"

const planos = [
  {
    nome: "Starter",
    tagline: "Pra quem está começando",
    preco: "R$ 99",
    periodo: "/mês",
    features: [
      "Até 50 matrículas/mês",
      "Subdomínio .profissionalizamaisbrasil.com.br",
      "Catálogo completo (120 cursos)",
      "Suporte por email",
    ],
    cta: "Começar Agora",
    destaque: false,
  },
  {
    nome: "Growth",
    tagline: "Pra quem quer escalar",
    preco: "R$ 249",
    periodo: "/mês",
    features: [
      "Matrículas ilimitadas",
      "Domínio personalizado",
      "Catálogo completo + exclusivos",
      "Suporte prioritário",
      "Dashboard avançado",
    ],
    cta: "Escolher Growth",
    destaque: true,
  },
  {
    nome: "Enterprise",
    tagline: "Pra grandes operações",
    preco: "R$ 599",
    periodo: "/mês",
    features: [
      "Tudo do Growth",
      "Gerente de conta dedicado",
      "White-label 100% branded",
      "Integração com CRM próprio",
      "SLA garantido",
    ],
    cta: "Falar com vendas",
    destaque: false,
  },
]

export function PlanosSection() {
  return (
    <section id="planos" className="bg-[#FAFAFA] py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[#1A1A2E] md:text-4xl">
            Planos que crescem com você
          </h2>
          <p className="mt-4 text-gray-600">
            Escolha o plano ideal. Comece com o Starter e evolua quando quiser.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3 md:items-stretch">
          {planos.map((plano) => (
            <div
              key={plano.nome}
              className={`relative flex flex-col rounded-2xl border bg-white p-6 transition-all lg:p-8 ${
                plano.destaque
                  ? "border-blue-600 shadow-lg md:-translate-y-2"
                  : "border-gray-200 hover:shadow-md"
              }`}
            >
              {plano.destaque && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-4 py-1 text-xs font-semibold text-white">
                  Mais popular
                </div>
              )}

              <div>
                <h3 className="text-xl font-bold text-[#1A1A2E]">{plano.nome}</h3>
                <p className="mt-1 text-sm text-gray-600">{plano.tagline}</p>
              </div>

              <div className="mt-6 flex items-baseline gap-1">
                <span className="font-mono text-4xl font-bold text-[#1A1A2E]">
                  {plano.preco}
                </span>
                <span className="text-sm text-gray-500">{plano.periodo}</span>
              </div>

              <ul className="mt-6 flex-1 space-y-3">
                {plano.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-gray-700">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Link href="/seja-revendedor" className="mt-8">
                <Button
                  className={`w-full ${
                    plano.destaque
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "bg-white text-[#1A1A2E] hover:bg-gray-50"
                  }`}
                  variant={plano.destaque ? "default" : "outline"}
                >
                  {plano.cta}
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
