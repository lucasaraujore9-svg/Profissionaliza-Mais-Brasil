"use client"

import { CreditCard, QrCode, CalendarCheck } from "lucide-react"
import type { PagamentoForm } from "./checkout-wizard"

type BillingType = PagamentoForm["billingType"]

const paymentMethods: Array<{
  id: BillingType
  label: string
  description: string
  icon: typeof CreditCard
}> = [
  {
    id: "CREDIT_CARD",
    label: "Cartão de crédito",
    description: "Cobrança recorrente mensal automática.",
    icon: CreditCard,
  },
  {
    id: "PIX",
    label: "PIX mensal",
    description: "Receba um QR Code todo mês com 7 dias de antecedência.",
    icon: QrCode,
  },
  {
    id: "BOLETO",
    label: "Boleto mensal",
    description: "Boleto enviado por email 7 dias antes do vencimento.",
    icon: CalendarCheck,
  },
]

interface CheckoutPaymentPreviewProps {
  value: PagamentoForm
  onChange: (value: PagamentoForm) => void
}

export function CheckoutPaymentPreview({
  value,
  onChange,
}: CheckoutPaymentPreviewProps) {
  return (
    <div>
      <h2 className="text-xl font-bold text-[var(--color-pmb-green-900)] md:text-2xl">
        Forma de pagamento
      </h2>
      <p className="mt-1 text-sm text-gray-600">
        Escolha como deseja pagar a mensalidade do seu plano.
      </p>

      <div className="mt-6 space-y-3">
        {paymentMethods.map((method) => {
          const Icon = method.icon
          const isActive = value.billingType === method.id
          return (
            <button
              key={method.id}
              type="button"
              onClick={() => onChange({ billingType: method.id })}
              className={`flex w-full items-start gap-4 rounded-xl border-2 p-4 text-left transition-all ${
                isActive
                  ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-lime-50)]/50 shadow-sm"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                  isActive ? "bg-[var(--color-pmb-green)] text-white" : "bg-gray-100 text-gray-500"
                }`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                    {method.label}
                  </span>
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                      isActive
                        ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-green)]"
                        : "border-gray-300 bg-white"
                    }`}
                  >
                    {isActive && (
                      <span className="h-2 w-2 rounded-full bg-white" />
                    )}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-600">
                  {method.description}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      <div className="mt-6 rounded-xl border border-dashed border-gray-300 bg-gray-50/50 p-4 text-xs text-gray-600">
        Ao concluir, você concorda com os termos de serviço e autoriza a
        cobrança recorrente da mensalidade do plano escolhido.
      </div>
    </div>
  )
}
