import { Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"

const features = [
  { nome: "Matrículas por mês", starter: "50", growth: "Ilimitado", enterprise: "Ilimitado" },
  { nome: "Catálogo de cursos", starter: "120", growth: "120+Exclusivos", enterprise: "Tudo" },
  { nome: "Domínio custom", starter: false, growth: true, enterprise: true },
  { nome: "Dashboard avançado", starter: false, growth: true, enterprise: true },
  { nome: "Gerente dedicado", starter: false, growth: false, enterprise: true },
  { nome: "SLA garantido", starter: false, growth: false, enterprise: true },
  { nome: "Suporte 24/7", starter: false, growth: true, enterprise: true },
  { nome: "White-label 100%", starter: false, growth: false, enterprise: true },
]

function FeatureCell({ value }: { value: string | boolean }) {
  if (typeof value === "boolean") {
    return value ? (
      <Check className="mx-auto h-4 w-4 text-blue-600" />
    ) : (
      <X className="mx-auto h-4 w-4 text-gray-300" />
    )
  }
  return <span className="text-sm text-gray-700">{value}</span>
}

export function PlanosComparativo() {
  return (
    <section id="planos" className="bg-white py-16 md:py-24">
      <div className="mx-auto max-w-5xl px-4 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[#1A1A2E] md:text-4xl">
            Compare os planos
          </h2>
          <p className="mt-4 text-gray-600">
            Transparência total. Sem pegadinhas. Escolha o plano certo pro seu momento.
          </p>
        </div>

        <div className="mt-12 overflow-x-auto rounded-2xl border border-gray-200 bg-white">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-gray-200 bg-[#FAFAFA]">
                <th className="p-6 text-left text-sm font-semibold text-gray-500">
                  Funcionalidade
                </th>
                <th className="p-6 text-center">
                  <div className="text-sm font-semibold text-[#1A1A2E]">Starter</div>
                  <div className="mt-1 font-mono text-2xl font-bold text-[#1A1A2E]">
                    R$ 99
                  </div>
                  <div className="text-xs text-gray-500">/mês</div>
                </th>
                <th className="relative p-6 text-center">
                  <div className="absolute inset-x-0 top-0 rounded-t-none bg-blue-600 py-1 text-xs font-semibold text-white">
                    Mais popular
                  </div>
                  <div className="mt-4 text-sm font-semibold text-[#1A1A2E]">Growth</div>
                  <div className="mt-1 font-mono text-2xl font-bold text-blue-600">
                    R$ 249
                  </div>
                  <div className="text-xs text-gray-500">/mês</div>
                </th>
                <th className="p-6 text-center">
                  <div className="text-sm font-semibold text-[#1A1A2E]">Enterprise</div>
                  <div className="mt-1 font-mono text-2xl font-bold text-[#1A1A2E]">
                    R$ 599
                  </div>
                  <div className="text-xs text-gray-500">/mês</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {features.map((f) => (
                <tr key={f.nome} className="border-b border-gray-100 last:border-0">
                  <td className="px-6 py-4 text-sm text-gray-700">{f.nome}</td>
                  <td className="px-6 py-4 text-center">
                    <FeatureCell value={f.starter} />
                  </td>
                  <td className="bg-blue-50/30 px-6 py-4 text-center">
                    <FeatureCell value={f.growth} />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <FeatureCell value={f.enterprise} />
                  </td>
                </tr>
              ))}
              <tr>
                <td className="px-6 py-6" />
                <td className="px-6 py-6 text-center">
                  <Button variant="outline" size="sm">
                    Escolher Starter
                  </Button>
                </td>
                <td className="bg-blue-50/30 px-6 py-6 text-center">
                  <Button size="sm" className="bg-blue-600 text-white hover:bg-blue-700">
                    Escolher Growth
                  </Button>
                </td>
                <td className="px-6 py-6 text-center">
                  <Button variant="outline" size="sm">
                    Falar com vendas
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
