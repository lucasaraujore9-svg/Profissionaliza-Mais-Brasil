import { Check, Shield } from "lucide-react"

// Resumo do plano base (Profissionaliza, R$ 209) para o checkout direto.
// A landing /seja-revendedor agora oferece dois planos (ver planos-pmb.tsx):
// Profissionaliza e Profissionaliza PRO (+R$ 30, com Automação). Quando o
// checkout passar a vender o PRO, este componente deve receber o plano
// selecionado via props em vez de hardcoded.
const PLAN = {
  name: "Plano Profissionaliza",
  priceLabel: "R$ 209",
  cadenceLabel: "/mês",
  pitch: "Tudo o que você precisa para montar sua escola digital.",
  features: [
    "Vitrine personalizada com seu domínio (ou subdomínio livrecursos.com.br)",
    "Catálogo completo de cursos profissionalizantes liberado",
    "Mercado Pago integrado — receba direto na sua conta",
    "Matrícula automática do aluno após o pagamento",
    "Cupons de desconto, equipe e suporte por WhatsApp",
  ],
}

export function CheckoutResumoPlano() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:sticky lg:top-24">
      <span className="text-xs font-medium uppercase tracking-wider text-[var(--color-pmb-green)]">
        Plano escolhido
      </span>

      <h3 className="mt-2 text-lg font-bold text-[var(--color-pmb-green-900)]">
        {PLAN.name}
      </h3>
      <p className="mt-1 text-sm text-gray-600">{PLAN.pitch}</p>

      <div className="mt-5 rounded-xl bg-gradient-to-br from-[var(--color-pmb-green)] to-[var(--color-pmb-green-700)] p-5 text-white">
        <div className="flex items-baseline gap-1">
          <span className="font-mono text-3xl font-bold">{PLAN.priceLabel}</span>
          <span className="text-sm opacity-80">{PLAN.cadenceLabel}</span>
        </div>
        <p className="mt-1 text-xs opacity-80">
          Cobrança recorrente. Cancele quando quiser.
        </p>
      </div>

      <ul className="mt-5 space-y-2.5">
        {PLAN.features.map((feature) => (
          <li
            key={feature}
            className="flex items-start gap-2 text-sm text-gray-700"
          >
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
