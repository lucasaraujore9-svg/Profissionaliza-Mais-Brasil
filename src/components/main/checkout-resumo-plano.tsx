import { Check, Shield } from "lucide-react"

const planFeatures = [
  "Vitrine com domínio personalizado",
  "Até 500 alunos ativos",
  "Integração com Mercado Pago",
  "Catálogo com 200+ cursos",
  "Suporte por WhatsApp",
] as const

export function CheckoutResumoPlano() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:sticky lg:top-24">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-blue-600">
          Plano escolhido
        </span>
        <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
          Growth
        </span>
      </div>

      <h3 className="mt-2 text-lg font-bold text-[#1A1A2E]">
        Plano Growth
      </h3>
      <p className="mt-1 text-sm text-gray-600">
        Ideal para quem já tem base de alunos.
      </p>

      <div className="mt-5 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 p-5 text-white">
        <div className="flex items-baseline gap-1">
          <span className="font-mono text-3xl font-bold">R$ 297</span>
          <span className="text-sm opacity-80">/mês</span>
        </div>
        <p className="mt-1 text-xs opacity-80">
          Cobrança recorrente. Cancele quando quiser.
        </p>
      </div>

      <ul className="mt-5 space-y-2.5">
        {planFeatures.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm text-gray-700">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/50 p-3 text-xs text-gray-600">
        <Shield className="h-4 w-4 shrink-0 text-gray-500" />
        <span>Garantia de 7 dias. Reembolso 100% se não gostar.</span>
      </div>
    </div>
  )
}
