"use client"

import { useState } from "react"
import { CreditCard, Landmark, QrCode } from "lucide-react"

const metodos = [
  {
    id: "credito",
    label: "Cartão de Crédito",
    hint: "Em até 3x sem juros",
    icon: CreditCard,
  },
  {
    id: "debito",
    label: "Cartão de Débito",
    hint: "Aprovação imediata",
    icon: Landmark,
  },
  {
    id: "pix",
    label: "PIX",
    hint: "Desconto de 5% à vista",
    icon: QrCode,
  },
]

export function PaymentInfo() {
  const [selected, setSelected] = useState("credito")

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 font-mono text-sm font-semibold text-blue-600">
          02
        </div>
        <h2 className="text-base font-semibold text-[#1A1A2E]">Forma de pagamento</h2>
      </div>

      <div className="mt-6 space-y-3">
        {metodos.map((m) => {
          const isActive = selected === m.id
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setSelected(m.id)}
              className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-all ${
                isActive
                  ? "border-blue-600 bg-blue-50/50 shadow-sm"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                  isActive ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"
                }`}
              >
                <m.icon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-[#1A1A2E]">{m.label}</div>
                <div className="text-xs text-gray-500">{m.hint}</div>
              </div>
              <div
                className={`h-5 w-5 shrink-0 rounded-full border-2 ${
                  isActive
                    ? "border-blue-600 bg-blue-600"
                    : "border-gray-300 bg-white"
                }`}
              >
                {isActive && (
                  <div className="h-full w-full rounded-full border-2 border-white bg-blue-600" />
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
