"use client"

import { buildInstallmentOptions } from "@/lib/mercadopago/installments"

/**
 * Seletor de parcelas do cartão numa assinatura da loja. 1x mantém o cartão de
 * hoje; 2x ou mais compra o período inteiro parcelado (`card-installments.ts`).
 * O teto (`max`) vem de `subscriptionCardInstallmentsCap`, a mesma conta do
 * servidor.
 */
export function SubscriptionInstallmentsSelect({
  price,
  max,
  interestFree,
  value,
  onChange,
  className,
  renewalHint = true,
}: {
  price: number
  max: number
  /** Parcelas sem juros da loja (no Asaas, todas: o teto já é o sem juros). */
  interestFree: number
  value: number
  onChange: (n: number) => void
  className: string
  /** Mostra o aviso de que a renovação parcelada não é automática. */
  renewalHint?: boolean
}) {
  if (max < 2) return null
  const options = buildInstallmentOptions([], {
    amount: price,
    maxInstallments: max,
    interestFreeInstallments: interestFree,
  })
  return (
    <label className="text-sm sm:col-span-2">
      Parcelas
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={className}
      >
        {options.map((o) => (
          <option key={o.installments} value={o.installments}>
            {o.label}
          </option>
        ))}
      </select>
      {value > 1 && renewalHint && (
        <span className="mt-1 block text-xs text-gray-500">
          O período inteiro é pago agora, parcelado no cartão. A renovação não é
          automática: perto do fim do período você recebe o aviso para pagar o
          próximo.
        </span>
      )}
    </label>
  )
}
