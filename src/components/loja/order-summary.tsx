import { Tag } from "lucide-react"

export interface OrderSummaryProps {
  courseName: string
  courseCategory: string | null
  courseHours: string | null
  basePrice: number
  discountAmount: number
  finalPrice: number
  couponCode: string | null
  parcelasSugeridas: number | null
}

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  })
}

export function OrderSummary({
  courseName,
  courseCategory,
  courseHours,
  basePrice,
  discountAmount,
  finalPrice,
  couponCode,
  parcelasSugeridas,
}: OrderSummaryProps) {
  const parcelasLabel =
    parcelasSugeridas && parcelasSugeridas >= 2
      ? `${parcelasSugeridas}x de ${formatBRL(finalPrice / parcelasSugeridas)}`
      : null

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
      <h2 className="text-base font-semibold text-[var(--color-pmb-green-900)]">Resumo do pedido</h2>

      <div className="mt-5 flex gap-4 border-b border-gray-100 pb-5">
        <div className="h-20 w-20 shrink-0 rounded-xl bg-gradient-to-br from-[var(--color-pmb-mist)]0 to-[var(--color-pmb-green-900)]" />
        <div className="flex-1">
          <div className="text-xs font-medium text-gray-500">
            {courseCategory ?? "Curso"}
          </div>
          <h3 className="mt-0.5 text-sm font-semibold leading-snug text-[var(--color-pmb-green-900)]">
            {courseName}
          </h3>
          {courseHours && (
            <div className="mt-1 text-xs text-gray-500">{courseHours}</div>
          )}
        </div>
      </div>

      <dl className="mt-5 space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-gray-600">Subtotal</dt>
          <dd className="font-mono text-[var(--color-pmb-green-900)]">{formatBRL(basePrice)}</dd>
        </div>
        {discountAmount > 0 && (
          <div className="flex items-center justify-between">
            <dt className="text-gray-600">
              Desconto{couponCode ? ` (${couponCode})` : ""}
            </dt>
            <dd className="font-mono font-semibold text-green-600">
              -{formatBRL(discountAmount)}
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-5">
        <span className="text-sm font-medium text-[var(--color-pmb-green-900)]">Total</span>
        <span className="font-mono text-2xl font-bold text-[var(--color-pmb-green-900)]">
          {formatBRL(finalPrice)}
        </span>
      </div>

      {parcelasLabel && (
        <div className="mt-2 text-right text-xs text-gray-500">
          ou <span className="font-mono font-medium">{parcelasLabel}</span> sem juros
        </div>
      )}

      {couponCode && (
        <div className="mt-5 flex items-start gap-2 rounded-xl bg-[var(--color-pmb-lime-50)] p-3 text-xs text-[var(--color-pmb-green-700)]">
          <Tag className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Cupom <strong className="font-mono">{couponCode}</strong> aplicado
          </span>
        </div>
      )}
    </div>
  )
}
